import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for body parsing
  app.use(express.json({ limit: "15mb" }));

  // Helper to parse GitHub URL
  function parseGitHubUrl(urlStr: string) {
    try {
      // Clean up string
      let cleaned = urlStr.trim().replace(/\/$/, "");
      if (cleaned.startsWith("git@github.com:")) {
        cleaned = cleaned.replace("git@github.com:", "https://github.com/");
      }
      if (cleaned.endsWith(".git")) {
        cleaned = cleaned.slice(0, -4);
      }

      // Handle simple owner/repo string
      if (!cleaned.includes("/") || (!cleaned.startsWith("http://") && !cleaned.startsWith("https://") && cleaned.split("/").length === 2)) {
        const parts = cleaned.split("/");
        if (parts.length === 2) {
          return { owner: parts[0], repo: parts[1] };
        }
      }

      const url = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
      if (url.hostname !== "github.com") {
        throw new Error("Only GitHub repositories are supported.");
      }

      const paths = url.pathname.split("/").filter(Boolean);
      if (paths.length < 2) {
        throw new Error("Invalid GitHub URL. Must contain owner and repository name.");
      }

      return { owner: paths[0], repo: paths[1] };
    } catch (e: any) {
      throw new Error(`Invalid GitHub URL: ${e.message}`);
    }
  }

  // Helper for GitHub requests (handles authentication if user provides a token)
  async function fetchGitHub(endpoint: string, customToken?: string) {
    const headers: Record<string, string> = {
      "User-Agent": "github-repo-analyzer-app",
      "Accept": "application/vnd.github.v3+json",
    };

    if (customToken) {
      headers["Authorization"] = `token ${customToken}`;
    }

    const response = await fetch(`https://api.github.com/${endpoint}`, { headers });
    if (!response.ok) {
      if (response.status === 403) {
        const rateLimitReset = response.headers.get("X-RateLimit-Reset");
        const resetTime = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toLocaleTimeString() : "soon";
        throw new Error(`GitHub API Rate limit exceeded. Try again after ${resetTime} or provide a GitHub Personal Access Token in the settings.`);
      }
      throw new Error(`GitHub API responded with status ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  // Endpoint: Get repository metadata
  app.get("/api/github/repo", async (req, res) => {
    try {
      const urlStr = req.query.url as string;
      const token = req.headers["x-github-token"] as string;

      if (!urlStr) {
        res.status(400).json({ error: "Missing 'url' query parameter" });
        return;
      }

      const { owner, repo } = parseGitHubUrl(urlStr);
      const repoData = await fetchGitHub(`repos/${owner}/${repo}`, token);
      
      // Fetch languages as well
      let languages = {};
      try {
        languages = await fetchGitHub(`repos/${owner}/${repo}/languages`, token);
      } catch (e) {
        console.warn("Failed to fetch languages:", e);
      }

      res.json({
        owner,
        repo,
        name: repoData.name,
        fullName: repoData.full_name,
        description: repoData.description,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        defaultBranch: repoData.default_branch,
        languages: Object.keys(languages),
        size: repoData.size,
        updatedAt: repoData.updated_at,
        htmlUrl: repoData.html_url,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint: Get recursive file tree of the repo
  app.get("/api/github/tree", async (req, res) => {
    try {
      const urlStr = req.query.url as string;
      const branch = req.query.branch as string;
      const token = req.headers["x-github-token"] as string;

      if (!urlStr) {
        res.status(400).json({ error: "Missing 'url' query parameter" });
        return;
      }

      const { owner, repo } = parseGitHubUrl(urlStr);
      
      // If branch not specified, get repo metadata to find default branch
      let targetBranch = branch;
      if (!targetBranch) {
        const repoData = await fetchGitHub(`repos/${owner}/${repo}`, token);
        targetBranch = repoData.default_branch;
      }

      // Fetch recursive tree
      const treeData = await fetchGitHub(`repos/${owner}/${repo}/git/trees/${targetBranch}?recursive=1`, token);
      
      if (!treeData.tree || !Array.isArray(treeData.tree)) {
        throw new Error("Could not fetch repository file tree");
      }

      // Filter tree elements to exclude common binary and generated folders
      const excludedPatterns = [
        /(^|\/)\.git\//,
        /(^|\/)node_modules\//,
        /(^|\/)dist\//,
        /(^|\/)build\//,
        /(^|\/)\.next\//,
        /(^|\/)venv\//,
        /(^|\/)\.env/,
        /\.(png|jpe?g|gif|ico|svg|woff2?|eot|ttf|mp4|webm|zip|tar\.gz|gz|rar|exe|pdf|dmg)$/i,
      ];

      const filteredTree = treeData.tree
        .filter((item: any) => {
          return !excludedPatterns.some((pattern) => pattern.test(item.path));
        })
        .map((item: any) => ({
          path: item.path,
          type: item.type === "tree" ? "directory" : "file",
          size: item.size || 0,
        }));

      res.json({
        owner,
        repo,
        branch: targetBranch,
        tree: filteredTree,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint: Fetch specific file contents from the repository
  app.post("/api/github/files", async (req, res) => {
    try {
      const { url, branch, paths } = req.body;
      const token = req.headers["x-github-token"] as string;

      if (!url || !paths || !Array.isArray(paths)) {
        res.status(400).json({ error: "Missing 'url' or 'paths' (array) in request body" });
        return;
      }

      const { owner, repo } = parseGitHubUrl(url);

      // Concurrently fetch raw file contents up to 10 files
      const fetchPromises = paths.slice(0, 15).map(async (filePath: string) => {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
          const headers: Record<string, string> = {
            "User-Agent": "github-repo-analyzer-app",
          };
          if (token) {
            headers["Authorization"] = `token ${token}`;
          }

          const fileRes = await fetch(rawUrl, { headers });
          if (!fileRes.ok) {
            return { path: filePath, content: `Error loading file: ${fileRes.statusText}`, error: true };
          }
          const content = await fileRes.text();
          
          // Truncate file if extremely large to save token usage
          const maxCharLimit = 30000;
          if (content.length > maxCharLimit) {
            return {
              path: filePath,
              content: content.slice(0, maxCharLimit) + "\n\n... [TRUNCATED DUE TO SIZE LIMIT] ...",
              truncated: true,
            };
          }

          return { path: filePath, content };
        } catch (e: any) {
          return { path: filePath, content: `Failed to load: ${e.message}`, error: true };
        }
      });

      const results = await Promise.all(fetchPromises);
      const filesContent = results.reduce((acc: any, file: any) => {
        acc[file.path] = { content: file.content, error: file.error, truncated: file.truncated };
        return acc;
      }, {});

      res.json({ files: filesContent });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint: Analyze the repository using Gemini API
  app.post("/api/analyze", async (req, res) => {
    try {
      const { repoMetadata, fileTree, filesContent, customFocus } = req.body;

      if (!apiKey) {
        res.status(500).json({ error: "Gemini API Key is not configured on the server. Please define GEMINI_API_KEY in your environment." });
        return;
      }

      if (!repoMetadata || !fileTree) {
        res.status(400).json({ error: "Missing repository metadata or file tree in payload" });
        return;
      }

      // Format the file tree to be readable for the model
      const formattedTree = fileTree
        .slice(0, 150) // limit size
        .map((item: any) => `- ${item.path} (${item.type})`)
        .join("\n");

      // Format the file contents
      let formattedFiles = "";
      for (const [filePath, fileData] of Object.entries(filesContent)) {
        const data = fileData as any;
        formattedFiles += `\n--- File: ${filePath} ---\n`;
        formattedFiles += `\`\`\`\n${data.content}\n\`\`\`\n`;
      }

      // Build precise instruction and prompt for Gemini
      const systemInstruction = `You are an elite Senior Software Engineer and Open Source Contributor. 
Your task is to perform a deep-dive, professional review/analysis of a GitHub repository based on its metadata, file structure, and key file contents.
Maintain a highly technical, objective, professional yet helpful and encouraging tone (exactly like a thorough GitHub Pull Request review or a high-quality, professional README analysis).

You MUST structure your response using the following framework EXACTLY:

1. **Repository Overview**
   - Briefly summarize the purpose, core domain, and value proposition of the project.
   - List the core technologies, languages, and major frameworks used, referencing the configuration/manifest files if provided.

2. **Structural Analysis**
   - Explain the core architecture pattern (e.g. MVC, Clean Architecture, Monorepo, Client-Server, Modular monolith).
   - Identify the "Entry Point" of the application (e.g., index.html, server.ts, main.go, index.js) and detail the primary logic flow from bootup to request/UI execution.

3. **Code Quality & Best Practices**
   - Highlight potential bugs, code smell, anti-patterns, or technical debt you observe in the provided source files. Be specific! Reference file names and line concepts (or code patterns).
   - Comment on the overall readability, nesting depth, naming conventions, type safety, modularity, and maintainability of the codebase.

4. **Security & Performance Audit**
   - Flag potential security vulnerabilities (e.g., hardcoded secrets, insecure API handling, unsanitized inputs, vulnerable dependencies, or CORS issues).
   - Suggest performance optimizations (e.g., excessive re-renders, caching opportunities, database query issues, memory leaks, or bundle size bottlenecks).

5. **Actionable Suggestions**
   - Provide 3 to 5 specific, concrete, prioritized recommendations to improve the repository.
   - Present these recommendations as clean code blocks or detailed bullet points.
   - Suggest "Good First Issues" or logical next features that would add significant value to this project.

Formatting Rules:
- Use clean, standard GitHub-Flavored Markdown.
- Use bold headers (e.g., "1. **Repository Overview**") for the 5 key sections.
- Do not make up facts; limit your observations to the provided repository data, file structure, and code snippets.
- If certain information is missing (e.g., no package.json is provided), explicitly note it and state what you infer from the file tree.`;

      let promptText = `Please analyze this repository:
Repository Name: ${repoMetadata.fullName}
Description: ${repoMetadata.description || "No description provided"}
Stars: ${repoMetadata.stars} | Forks: ${repoMetadata.forks}
Primary Languages/Tech detected: ${repoMetadata.languages?.join(", ") || "Unknown"}
Default Branch: ${repoMetadata.defaultBranch}

FILE STRUCTURE TREE (Filtered):
${formattedTree}
${fileTree.length > 150 ? "\n... (File tree truncated for token limits) ..." : ""}

KEY FILE CONTENTS PROVIDED FOR DIRECT CODE AUDIT:
${formattedFiles || "No specific file contents provided."}
`;

      if (customFocus) {
        promptText += `\nSPECIAL USER ANALYTIC FOCUS OR QUESTION:
${customFocus}
Please make sure to address this focus area in detail across the relevant sections of your analysis.`;
      }

      // Call Gemini 3.5 Flash (the recommended fast & powerful model for general text tasks)
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptText,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2, // Low temperature for high precision and analytical consistency
        }
      });

      const markdownText = response.text || "Failed to generate analysis. No content was returned.";

      res.json({ analysis: markdownText });
    } catch (error: any) {
      console.error("Gemini analysis error:", error);
      res.status(500).json({ error: `Gemini Analysis failed: ${error.message}` });
    }
  });

  // Endpoint: Suggest Custom Audit Focus Areas using Gemini
  app.post("/api/suggest-focus", async (req, res) => {
    const { repoMetadata, selectedFiles, languages } = req.body;

    // Smart fallback generator helper
    const getSmartFallbackSuggestions = () => {
      const filePaths = selectedFiles || [];
      const langList = languages || repoMetadata?.languages || [];
      const suggestions: string[] = [];

      const hasReact = langList.some((l: string) => /react|javascript|typescript/i.test(l)) || filePaths.some(p => /\.(jsx|tsx|js|ts)$/i.test(p));
      const hasBackend = langList.some((l: string) => /node|python|go|java|ruby|php|c#/i.test(l)) || filePaths.some(p => /server|api|app\.js|main\.py|routes/i.test(p));
      const hasDockerOrConfig = filePaths.some(p => /docker|yaml|yml|json|config/i.test(p));

      if (hasReact) {
        suggestions.push("Audit React rendering loops, state updates, and memory leaks in mount transitions.");
      }
      if (hasBackend) {
        suggestions.push("Inspect API security headers, input validation rules, and async error boundaries.");
      }
      if (hasDockerOrConfig) {
        suggestions.push("Evaluate deployment package manifests, environment variable safeguards, and config files.");
      }

      if (suggestions.length < 1) {
        suggestions.push("Analyze code modularity, architecture patterns, and naming conventions for solid readability.");
      }
      if (suggestions.length < 2) {
        suggestions.push("Evaluate general code quality metrics, dependency safety, and structural design choices.");
      }
      if (suggestions.length < 3) {
        suggestions.push("Review technical debt, error handling boundaries, and resource management strategies.");
      }

      return suggestions.slice(0, 3);
    };

    if (!repoMetadata) {
      res.status(400).json({ error: "Missing repository metadata" });
      return;
    }

    if (!apiKey) {
      console.warn("Gemini API Key is not configured on the server. Using smart fallback suggestions.");
      res.json({ suggestions: getSmartFallbackSuggestions(), isFallback: true });
      return;
    }

    try {
      const prompt = `You are an elite Senior Solutions Architect and Code Auditor. 
Given these repository details:
- Repository Name: ${repoMetadata.fullName}
- Description: ${repoMetadata.description || "No description provided"}
- Primary Tech/Languages: ${languages?.join(", ") || repoMetadata.languages?.join(", ") || "Not specified"}
- Selected files for Audit: ${selectedFiles?.slice(0, 15).join(", ") || "None"}

Please generate 3 highly valuable, contextual, and distinct Custom Audit Focus suggestions. Each suggestion should focus on a specific, practical technical aspect of the selected files (e.g., error handling, React render performance, state updates, security inputs, dependency gaps, modular design).

Keep each suggestion short, precise, action-oriented, and professional (maximum 15 words or 1.5 lines per suggestion).

You MUST return the suggestions strictly as a JSON array of 3 strings. Do not wrap in markdown or write conversational preamble.
Example response:
[
  "Analyze asynchronous middleware error propagation and token verification in routing.",
  "Check for modular component composition and stale dependencies in package files.",
  "Audit input validation and memory leaks within file rendering cycles."
]`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.7,
        }
      });

      const jsonStr = response.text || "[]";
      let suggestions = [];
      try {
        suggestions = JSON.parse(jsonStr.trim());
      } catch (parseError) {
        // Fallback robust parse if markdown block is wrapped
        const cleaned = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
        suggestions = JSON.parse(cleaned);
      }

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        suggestions = getSmartFallbackSuggestions();
      }

      res.json({ suggestions: suggestions.slice(0, 3) });
    } catch (error: any) {
      console.warn("Suggest focus Gemini call failed, falling back to smart defaults:", error.message || error);
      res.json({ suggestions: getSmartFallbackSuggestions(), isFallback: true });
    }
  });

  // Serve static assets from Vite or dist
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
