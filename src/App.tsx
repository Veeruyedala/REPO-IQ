import { useState, useEffect } from "react";
import {
  Github,
  Folder,
  FileCode,
  Terminal,
  Settings,
  Play,
  CheckCircle2,
  Activity,
  ShieldAlert,
  Lightbulb,
  FileText,
  Layers,
  Search,
  Copy,
  Check,
  RotateCcw,
  Download,
  AlertTriangle,
  Star,
  GitFork,
  ChevronRight,
  ChevronDown,
  Loader2,
  HelpCircle,
  Info,
  Sliders,
  Shield,
  Eye,
  Menu,
  X,
  History,
  Columns,
  Sparkles,
  Trash2
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "motion/react";
import { RepoMetadata, FileTreeItem, FileContentMap, SavedAudit } from "./types";

// Popular public repositories for developer quickstart
const POPULAR_REPOS = [
  {
    fullName: "expressjs/express",
    label: "Express.js",
    description: "Fast, unopinionated, minimalist web framework for Node.js",
    languages: ["JavaScript"],
    stars: 64100
  },
  {
    fullName: "octocat/Spoon-Knife",
    label: "Spoon-Knife",
    description: "A simple sandbox repository for practicing GitHub forks",
    languages: ["HTML", "CSS"],
    stars: 12500
  },
  {
    fullName: "lodash/lodash",
    label: "Lodash",
    description: "A modern JavaScript utility library delivering modularity, performance & extras",
    languages: ["JavaScript"],
    stars: 58800
  },
  {
    fullName: "facebook/create-react-app",
    label: "Create React App",
    description: "Set up a modern web app by running one command",
    languages: ["JavaScript", "TypeScript"],
    stars: 101000
  }
];

export default function App() {
  // Input fields
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem("github_token") || "");
  const [customFocus, setCustomFocus] = useState("");
  const [targetBranch, setTargetBranch] = useState("");

  // App UI state
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetched repo data
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<RepoMetadata | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeItem[]>([]);
  const [filesContent, setFilesContent] = useState<FileContentMap>({});
  const [activePreviewFile, setActivePreviewFile] = useState<string | null>(null);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [rawAnalysis, setRawAnalysis] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "structure" | "codeQuality" | "securityPerf" | "actionable" | "raw">("overview");

  // Saved Audits History & Compare Split-View State
  const [savedAudits, setSavedAudits] = useState<SavedAudit[]>(() => {
    try {
      const stored = localStorage.getItem("saved_audits");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [compareMode, setCompareMode] = useState(false);
  const [compareAuditId, setCompareAuditId] = useState<string>("");

  // AI custom focus suggestions
  const [suggestingFocus, setSuggestingFocus] = useState(false);
  const [suggestedFocusAreas, setSuggestedFocusAreas] = useState<string[]>([]);

  // Save Token to LocalStorage
  useEffect(() => {
    localStorage.setItem("github_token", githubToken);
  }, [githubToken]);

  // Handle Loading a popular repo
  const handleQuickstart = (fullName: string) => {
    setRepoUrl(`https://github.com/${fullName}`);
    setRepoError(null);
    fetchRepoDetails(`https://github.com/${fullName}`);
  };

  // Helper to parse file tree structure into folders
  const getSuggestedFiles = (tree: FileTreeItem[]): string[] => {
    const suggestions: string[] = [];
    const keywords = [
      "package.json", "cargo.toml", "requirements.txt", "go.mod", "pom.xml", "build.gradle", "tsconfig.json",
      "server.ts", "server.js", "main.go", "index.js", "app.py", "index.html", "readme.md", "App.tsx", "App.jsx"
    ];

    // Priority 1: Match files in keywords
    tree.forEach(item => {
      if (item.type === "file") {
        const fileName = item.path.split("/").pop()?.toLowerCase() || "";
        if (keywords.includes(fileName)) {
          suggestions.push(item.path);
        }
      }
    });

    // Priority 2: If we have fewer than 8 suggestions, add major source files (js, ts, py, go, rs, etc)
    if (suggestions.length < 8) {
      for (const item of tree) {
        if (item.type === "file" && !suggestions.includes(item.path)) {
          const extension = item.path.split(".").pop()?.toLowerCase();
          if (["ts", "tsx", "js", "jsx", "go", "py", "rs", "java", "cpp", "c"].includes(extension || "") && item.size < 50000) {
            suggestions.push(item.path);
          }
        }
        if (suggestions.length >= 12) break; // Limit auto-select size
      }
    }

    return suggestions.slice(0, 15); // Return top 15 files max to prevent token blowup
  };

  // Fetch repository metadata and recursive tree
  const fetchRepoDetails = async (urlToFetch: string) => {
    if (!urlToFetch.trim()) {
      setRepoError("Please enter a valid GitHub repository URL.");
      return;
    }

    setLoadingRepo(true);
    setRepoError(null);
    setMetadata(null);
    setFileTree([]);
    setFilesContent({});
    setActivePreviewFile(null);
    setRawAnalysis("");

    try {
      // 1. Fetch Repository Metadata
      const metadataRes = await fetch(`/api/github/repo?url=${encodeURIComponent(urlToFetch)}`, {
        headers: githubToken ? { "x-github-token": githubToken } : {}
      });

      if (!metadataRes.ok) {
        const errData = await metadataRes.json();
        throw new Error(errData.error || "Failed to fetch repository metadata.");
      }

      const metadataData: RepoMetadata = await metadataRes.json();
      setMetadata(metadataData);

      // 2. Fetch File Tree
      const treeRes = await fetch(`/api/github/tree?url=${encodeURIComponent(urlToFetch)}&branch=${targetBranch || ""}`, {
        headers: githubToken ? { "x-github-token": githubToken } : {}
      });

      if (!treeRes.ok) {
        const errData = await treeRes.json();
        throw new Error(errData.error || "Failed to fetch repository file tree.");
      }

      const treeData = await treeRes.json();
      const files: FileTreeItem[] = treeData.tree;

      // Smart default selections
      const suggestedPaths = getSuggestedFiles(files);
      const updatedTree = files.map(item => ({
        ...item,
        selected: suggestedPaths.includes(item.path)
      }));

      setFileTree(updatedTree);

      // 3. Pre-fetch content for the suggested files so they are ready
      if (suggestedPaths.length > 0) {
        const contentsRes = await fetch("/api/github/files", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(githubToken ? { "x-github-token": githubToken } : {})
          },
          body: JSON.stringify({
            url: urlToFetch,
            branch: treeData.branch,
            paths: suggestedPaths
          })
        });

        if (contentsRes.ok) {
          const contentsData = await contentsRes.json();
          setFilesContent(contentsData.files);
        }
      }
    } catch (err: any) {
      console.error(err);
      setRepoError(err.message || "An unexpected error occurred while fetching repository.");
    } finally {
      setLoadingRepo(false);
    }
  };

  // Handle clicking file preview
  const handlePreviewFile = async (filePath: string) => {
    setActivePreviewFile(filePath);

    // If already loaded in filesContent, no need to fetch again
    if (filesContent[filePath] && !filesContent[filePath].error) {
      return;
    }

    try {
      const { owner, repo } = metadata!;
      const branch = targetBranch || metadata!.defaultBranch;
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;

      const headers: Record<string, string> = {};
      if (githubToken) {
        headers["Authorization"] = `token ${githubToken}`;
      }

      const res = await fetch(rawUrl, { headers });
      if (!res.ok) {
        throw new Error(`Failed to load file: ${res.statusText}`);
      }
      const text = await res.text();
      setFilesContent(prev => ({
        ...prev,
        [filePath]: { content: text }
      }));
    } catch (err: any) {
      setFilesContent(prev => ({
        ...prev,
        [filePath]: { content: `Error: Could not retrieve file content. ${err.message}`, error: true }
      }));
    }
  };

  // Toggle file selection
  const toggleFileSelect = (path: string) => {
    setFileTree(prev =>
      prev.map(item =>
        item.path === path ? { ...item, selected: !item.selected } : item
      )
    );
  };

  // Select all or deselect all files
  const selectAllFiles = (select: boolean) => {
    setFileTree(prev =>
      prev.map(item => (item.type === "file" ? { ...item, selected: select } : item))
    );
  };

  // Suggest Custom Focus areas via Gemini
  const handleSuggestFocus = async () => {
    if (!metadata) return;
    setSuggestingFocus(true);
    setSuggestedFocusAreas([]);
    try {
      const selectedPaths = fileTree.filter(f => f.type === "file" && f.selected).map(f => f.path);
      const res = await fetch("/api/suggest-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoMetadata: metadata,
          selectedFiles: selectedPaths,
          languages: metadata.languages
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestedFocusAreas(data.suggestions || []);
      } else {
        console.error("Failed to fetch suggestions");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSuggestingFocus(false);
    }
  };

  // Delete an audit from history
  const handleDeleteAudit = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this analysis from history?")) {
      const updated = savedAudits.filter(item => item.id !== id);
      setSavedAudits(updated);
      localStorage.setItem("saved_audits", JSON.stringify(updated));
      if (compareAuditId === id) {
        setCompareAuditId("");
        setCompareMode(false);
      }
    }
  };

  // Run the deep-dive analysis on selected files using Gemini
  const handleRunAnalysis = async () => {
    const selectedFiles = fileTree.filter(f => f.type === "file" && f.selected);

    if (selectedFiles.length === 0) {
      alert("Please select at least one file from the repository tree to analyze.");
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);
    setRawAnalysis("");

    // Simulated tech-audit progress states to keep developer highly engaged
    const steps = [
      { text: "Synthesizing repository file tree structure...", delay: 1000 },
      { text: "Extracting file details and scanning dependencies...", delay: 2000 },
      { text: "Consolidating core source code models...", delay: 3500 },
      { text: "Initiating Gemini analytical deep-dive reasoning...", delay: 6000 },
      { text: "Formatting repository overview and structural diagnostics...", delay: 10000 },
      { text: "Drafting code quality audits and security analysis...", delay: 14000 },
      { text: "Generating actionable refactor suggestions & Good First Issues...", delay: 18000 }
    ];

    steps.forEach((step, idx) => {
      setTimeout(() => {
        setAnalysisStep(step.text);
        setAnalysisProgress(Math.min(95, Math.floor((idx + 1) * (100 / steps.length))));
      }, step.delay);
    });

    try {
      // Collect the contents of selected files
      const contentToSubmit: Record<string, any> = {};
      
      // Filter out files that aren't fetched yet and fetch them in batch
      const filesNeedFetch = selectedFiles.filter(f => !filesContent[f.path] || filesContent[f.path].error);
      
      let finalFilesContent = { ...filesContent };

      if (filesNeedFetch.length > 0) {
        const fetchRes = await fetch("/api/github/files", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(githubToken ? { "x-github-token": githubToken } : {})
          },
          body: JSON.stringify({
            url: repoUrl,
            branch: targetBranch || metadata!.defaultBranch,
            paths: filesNeedFetch.map(f => f.path)
          })
        });

        if (fetchRes.ok) {
          const fetched = await fetchRes.json();
          finalFilesContent = { ...finalFilesContent, ...fetched.files };
          setFilesContent(finalFilesContent);
        }
      }

      // Prepare payload content map with only the audited file details
      selectedFiles.forEach(f => {
        contentToSubmit[f.path] = finalFilesContent[f.path] || { content: "Content failed to fetch." };
      });

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoMetadata: metadata,
          fileTree: fileTree.map(f => ({ path: f.path, type: f.type })),
          filesContent: contentToSubmit,
          customFocus: customFocus.trim()
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Analysis failed.");
      }

      const data = await res.json();
      setRawAnalysis(data.analysis);
      setAnalysisProgress(100);
      setActiveTab("overview");

      // Auto-save to history
      const newAudit: SavedAudit = {
        id: Date.now().toString(),
        repoName: metadata?.fullName || "unknown/repo",
        branch: targetBranch || metadata?.defaultBranch || "main",
        timestamp: new Date().toLocaleString(),
        analysis: data.analysis,
        customFocus: customFocus.trim(),
        selectedFilesCount: selectedFiles.length
      };
      setSavedAudits(prev => {
        const updated = [newAudit, ...prev];
        localStorage.setItem("saved_audits", JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || "Failed to perform Gemini repository analysis.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Copy analysis report to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(rawAnalysis);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download analysis report as markdown file
  const handleDownload = () => {
    const blob = new Blob([rawAnalysis], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${metadata?.name || "repository"}-deep-dive-analysis.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Parser function to extract sections from Gemini Markdown response
  const parseAnalysisSections = (markdown: string) => {
    const sections = {
      overview: "",
      structure: "",
      codeQuality: "",
      securityPerf: "",
      actionable: ""
    };

    const lines = markdown.split("\n");
    let currentSection: keyof typeof sections | null = null;
    let buffer: string[] = [];

    for (const line of lines) {
      const cleanLine = line.trim();
      
      // Match section headers precisely conforming to requested framework
      if (/overview/i.test(cleanLine) && (cleanLine.includes("1.") || cleanLine.includes("Repository"))) {
        if (currentSection && buffer.length > 0) {
          sections[currentSection] = buffer.join("\n");
        }
        currentSection = "overview";
        buffer = [line];
      } else if (/structural|structure/i.test(cleanLine) && (cleanLine.includes("2.") || cleanLine.includes("Analysis"))) {
        if (currentSection && buffer.length > 0) {
          sections[currentSection] = buffer.join("\n");
        }
        currentSection = "structure";
        buffer = [line];
      } else if ((/code quality/i.test(cleanLine) || /best practices/i.test(cleanLine) || /readability/i.test(cleanLine)) && (cleanLine.includes("3.") || cleanLine.includes("Quality"))) {
        if (currentSection && buffer.length > 0) {
          sections[currentSection] = buffer.join("\n");
        }
        currentSection = "codeQuality";
        buffer = [line];
      } else if (/security/i.test(cleanLine) && /performance/i.test(cleanLine) && (cleanLine.includes("4.") || cleanLine.includes("Audit"))) {
        if (currentSection && buffer.length > 0) {
          sections[currentSection] = buffer.join("\n");
        }
        currentSection = "securityPerf";
        buffer = [line];
      } else if (/actionable|suggestion/i.test(cleanLine) && (cleanLine.includes("5.") || cleanLine.includes("Suggestions"))) {
        if (currentSection && buffer.length > 0) {
          sections[currentSection] = buffer.join("\n");
        }
        currentSection = "actionable";
        buffer = [line];
      } else {
        if (currentSection) {
          buffer.push(line);
        } else {
          currentSection = "overview";
          buffer.push(line);
        }
      }
    }

    if (currentSection && buffer.length > 0) {
      sections[currentSection] = buffer.join("\n");
    }

    // Fallback verification
    const totalLength = Object.values(sections).reduce((acc, val) => acc + val.length, 0);
    if (totalLength < markdown.length * 0.4) {
      return null;
    }

    return sections;
  };

  const parsedSections = rawAnalysis ? parseAnalysisSections(rawAnalysis) : null;

  // Filter file tree based on search query
  const filteredFileTree = fileTree.filter(item =>
    item.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] font-sans flex flex-col antialiased">
      {/* Top Header Navigation */}
      <header className="border-b border-white/10 bg-white/[0.02] backdrop-blur-[15px] px-8 h-16 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-xs shadow">IQ</div>
          <div>
            <h1 className="text-xs font-bold text-indigo-400 uppercase tracking-widest leading-none mb-1">
              {metadata ? "Repository Deep-Dive" : "REPO IQ"}
            </h1>
            <p className="text-sm md:text-base font-bold text-[#f0f6fc] leading-none">
              {metadata ? (
                <>
                  {metadata.owner} / {metadata.name}{" "}
                  <span className="text-[#8b949e] font-normal text-xs ml-2 bg-white/[0.05] px-2 py-0.5 rounded border border-white/10">
                    {targetBranch || metadata.defaultBranch}
                  </span>
                </>
              ) : (
                "REPO IQ"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm font-medium">
          {metadata && (
            <div className="hidden md:flex items-center gap-6">
              <div className="flex items-center gap-1.5 text-[#8b949e]">
                <span className="text-[#8b949e] font-normal">Stars</span> 
                <span className="font-bold text-[#f0f6fc]">{(metadata.stars / 1000).toFixed(1)}k</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#8b949e]">
                <span className="text-[#8b949e] font-normal">Forks</span> 
                <span className="font-bold text-[#f0f6fc]">{(metadata.forks / 1000).toFixed(1)}k</span>
              </div>
              {metadata.languages.length > 0 && (
                <span className="px-2 py-1 bg-indigo-950/50 text-indigo-400 rounded text-xs font-mono font-bold border border-indigo-800/50">
                  {metadata.languages[0]}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded border flex items-center space-x-2 transition-all cursor-pointer text-xs font-mono ${
                showSettings
                  ? "bg-indigo-950/60 border-indigo-500 text-indigo-300 font-bold"
                  : "bg-white/[0.05] border-white/10 text-[#c9d1d9] hover:bg-white/[0.12] hover:text-[#f0f6fc]"
              }`}
              title="Settings & Authentication"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline font-bold uppercase tracking-wider text-[10px]">Token Settings</span>
            </button>

            {metadata && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 bg-white/[0.05] border border-white/10 rounded text-[#c9d1d9] hover:text-[#f0f6fc] md:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Panel Frame */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden gap-6 p-6">
        {/* Sidebar Controls (Inputs & File Selection) */}
        <AnimatePresence initial={false}>
          {(sidebarOpen || !metadata) && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="w-full md:w-96 flex flex-col shrink-0 overflow-y-auto sidebar"
            >
              <div className="p-5 space-y-6">
                {/* Repository URL input */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#8b949e] flex items-center justify-between">
                    <span>GitHub Repo URL</span>
                    <span title="e.g. https://github.com/expressjs/express or owner/repo">
                      <HelpCircle className="h-3 w-3 text-[#8b949e]" />
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="octocat/Spoon-Knife"
                      className="w-full bg-white/[0.04] border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/35 font-mono transition-colors"
                    />
                    <Github className="absolute right-3 top-2.5 h-4 w-4 text-[#8b949e] pointer-events-none" />
                  </div>
                </div>

                {/* Collapsible Token Settings Panel */}
                {showSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-4 rounded space-y-3 card"
                  >
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-tighter flex items-center space-x-1">
                        <Sliders className="h-3.5 w-3.5" />
                        <span>GitHub Token Settings</span>
                      </h4>
                      <p className="text-[10px] text-[#8b949e] leading-normal">
                        Provide a Personal Access Token (PAT) to bypass unauthenticated API rate limits. Tokens are stored only in your local browser cache.
                      </p>
                    </div>

                    <input
                      type="password"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/35 font-mono transition-colors"
                    />

                    <div className="space-y-1.5 pt-2">
                      <label className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Target Branch / Ref</label>
                      <input
                        type="text"
                        value={targetBranch}
                        onChange={(e) => setTargetBranch(e.target.value)}
                        placeholder="main (Optional)"
                        className="w-full bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/35 font-mono transition-colors"
                      />
                    </div>
                  </motion.div>
                )}

                {/* Action CTA Button */}
                <button
                  onClick={() => fetchRepoDetails(repoUrl)}
                  disabled={loadingRepo || !repoUrl.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-[#161b22] disabled:text-[#8b949e] text-white rounded py-2.5 px-4 font-display font-bold text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-sm border border-indigo-700 disabled:border-[#21262d]"
                >
                  {loadingRepo ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin animate-infinite" />
                      <span>Fetching Repository...</span>
                    </>
                  ) : (
                    <>
                      <Activity className="h-4 w-4" />
                      <span>Fetch Repository Details</span>
                    </>
                  )}
                </button>

                {repoError && (
                  <div className="p-3 bg-red-950/30 border border-red-800/50 rounded text-xs text-red-300 leading-relaxed flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{repoError}</span>
                  </div>
                )}

                {/* Interactive File Tree Selector */}
                {metadata && (
                  <div className="space-y-3 pt-4 border-t border-[#30363d]">
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-tighter flex items-center justify-between">
                        <span>Select Audit Targets</span>
                        <span className="text-[10px] bg-indigo-950/60 text-indigo-300 font-mono px-1.5 py-0.5 rounded font-bold border border-indigo-800/40">
                          {fileTree.filter(f => f.type === "file" && f.selected).length} Selected
                        </span>
                      </h3>
                      <p className="text-[11px] text-[#8b949e] leading-relaxed">
                        Choose the code files or config manifests you want Gemini to inspect during the deep dive.
                      </p>
                    </div>

                    {/* Quick select buttons */}
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          const suggested = getSuggestedFiles(fileTree);
                          setFileTree(prev =>
                            prev.map(item => ({
                              ...item,
                              selected: suggested.includes(item.path)
                            }))
                          );
                        }}
                        className="text-[10px] bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] px-2.5 py-1 rounded cursor-pointer transition-colors font-mono font-semibold uppercase tracking-wider"
                      >
                        Auto-Suggest
                      </button>
                      <button
                        onClick={() => selectAllFiles(true)}
                        className="text-[10px] bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] px-2.5 py-1 rounded cursor-pointer transition-colors font-mono font-semibold uppercase tracking-wider"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => selectAllFiles(false)}
                        className="text-[10px] bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] px-2.5 py-1 rounded cursor-pointer transition-colors font-mono font-semibold uppercase tracking-wider"
                      >
                        Deselect All
                      </button>
                    </div>

                    {/* File search inside tree */}
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter files..."
                        className="w-full bg-white/[0.04] border border-white/10 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/35 font-mono transition-colors"
                      />
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#8b949e]" />
                    </div>

                    {/* File list container */}
                    <div className="border border-white/10 bg-white/[0.02] rounded-lg max-h-72 overflow-y-auto divide-y divide-white/10 font-mono text-xs">
                      {filteredFileTree.length === 0 ? (
                        <div className="p-4 text-center text-[#8b949e]">No matching files found</div>
                      ) : (
                        filteredFileTree.map((item) => (
                          <div
                            key={item.path}
                            onClick={() => {
                              if (item.type === "file") {
                                handlePreviewFile(item.path);
                              }
                            }}
                            className={`flex items-center justify-between p-2 hover:bg-white/[0.06] transition-colors cursor-pointer group ${
                              activePreviewFile === item.path ? "bg-white/[0.1] text-white" : ""
                            }`}
                          >
                            <div className="flex items-center space-x-2 truncate">
                              {item.type === "file" ? (
                                <input
                                  type="checkbox"
                                  checked={!!item.selected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleFileSelect(item.path);
                                  }}
                                  className="rounded border-white/10 bg-white/[0.04] text-indigo-600 focus:ring-indigo-600 h-3.5 w-3.5 cursor-pointer"
                                />
                              ) : (
                                <span className="w-3.5 h-3.5" />
                              )}

                              {item.type === "directory" ? (
                                <Folder className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                              ) : (
                                <FileCode className="h-3.5 w-3.5 text-[#8b949e] shrink-0" />
                              )}

                              <span className="truncate text-[#c9d1d9] group-hover:text-[#f0f6fc] font-medium" title={item.path}>
                                {item.path}
                              </span>
                            </div>

                            {item.type === "file" && (
                              <span className="text-[10px] text-[#8b949e] shrink-0 pl-2">
                                {(item.size / 1024).toFixed(1)} KB
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Custom Analytical Focus Panel */}
                {metadata && (
                  <div className="space-y-3 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-indigo-400 uppercase tracking-tighter flex items-center space-x-1">
                        <Sliders className="h-3.5 w-3.5" />
                        <span>Custom Audit Focus</span>
                      </label>
                      <button
                        onClick={handleSuggestFocus}
                        disabled={suggestingFocus}
                        type="button"
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 disabled:text-slate-600 font-bold flex items-center space-x-1 cursor-pointer transition-colors"
                        title="Let Gemini suggest custom focus areas based on your tech stack"
                      >
                        <Sparkles className={`h-3 w-3 ${suggestingFocus ? "animate-spin animate-infinite" : ""}`} />
                        <span>{suggestingFocus ? "Suggesting..." : "AI Suggestions"}</span>
                      </button>
                    </div>

                    <p className="text-[10px] text-[#8b949e] leading-normal">
                      Ask Gemini to look out for specific code patterns or click <strong>AI Suggestions</strong> to generate tailored targets.
                    </p>
                    <textarea
                      value={customFocus}
                      onChange={(e) => setCustomFocus(e.target.value)}
                      placeholder="e.g. Audit the async error handling inside route middleware. Or, look for performance issues in the rendering lifecycle."
                      rows={3}
                      className="w-full bg-white/[0.04] border border-white/10 rounded p-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/35 transition-colors resize-none font-sans"
                    />

                    {/* AI Suggested Focus Area Capsules */}
                    {suggestedFocusAreas.length > 0 && (
                      <div className="space-y-1.5 pt-0.5">
                        <span className="text-[9px] font-extrabold text-[#8b949e] uppercase tracking-wider block">Recommended Focus Areas:</span>
                        <div className="space-y-1">
                          {suggestedFocusAreas.map((focus, idx) => (
                            <button
                              key={idx}
                              onClick={() => setCustomFocus(focus)}
                              type="button"
                              className="w-full text-left bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-200 p-2 rounded text-[10px] leading-snug border border-indigo-900/50 transition-colors line-clamp-2 block cursor-pointer"
                              title={focus}
                            >
                              {focus}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Trigger audit */}
                    <button
                      onClick={handleRunAnalysis}
                      disabled={analyzing}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-white/[0.03] disabled:text-white/40 disabled:border-white/10 text-white rounded py-3 px-4 font-display font-bold text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-sm border border-indigo-700"
                    >
                      {analyzing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin animate-infinite" />
                          <span>Auditing Codebase ({analysisProgress}%)</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 text-white fill-white" />
                          <span>Run Deep-Dive Audit</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Audit History Panel */}
                {metadata && savedAudits.length > 0 && (
                  <div className="space-y-2 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#8b949e] uppercase tracking-tighter flex items-center space-x-1">
                        <History className="h-3.5 w-3.5" />
                        <span>Audit History ({savedAudits.length})</span>
                      </label>
                    </div>
                    <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                      {savedAudits.map((audit) => (
                        <div
                          key={audit.id}
                          onClick={() => {
                            setRawAnalysis(audit.analysis);
                            setCustomFocus(audit.customFocus || "");
                            setActiveTab("overview");
                            setCompareMode(false);
                            if (audit.repoName && (!metadata || metadata.fullName !== audit.repoName)) {
                              setRepoUrl(`https://github.com/${audit.repoName}`);
                              setTargetBranch(audit.branch || "");
                              fetchRepoDetails(`https://github.com/${audit.repoName}`);
                            }
                          }}
                          className={`group flex items-center justify-between p-2 rounded border text-xs cursor-pointer transition-all ${
                            rawAnalysis === audit.analysis && !compareMode
                              ? "bg-white/[0.08] border-white/30 text-[#f0f6fc] font-semibold"
                              : "bg-white/[0.02] border-white/10 hover:bg-white/[0.06] text-[#c9d1d9]"
                          }`}
                        >
                          <div className="truncate pr-2">
                            <p className="font-mono text-[10px] truncate leading-tight font-bold text-[#f0f6fc]">
                              {audit.repoName}
                            </p>
                            <span className="text-[9px] text-[#8b949e] font-mono block">
                              {audit.timestamp} • {audit.selectedFilesCount} files
                            </span>
                          </div>
                          <div className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleDeleteAudit(audit.id, e)}
                              className="p-1 hover:bg-red-950/40 hover:text-red-400 rounded text-slate-400 cursor-pointer transition-colors"
                              title="Delete history"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Content Pane (Welcome / Loading / Analysis Report / File Preview) */}
        <main className="flex-1 flex flex-col overflow-hidden relative panel">
          {/* Welcome Screen (No Repo Loaded) */}
          {!metadata && !loadingRepo && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
              <div className="max-w-2xl space-y-8 my-auto">
                {/* Brand Showcase */}
                <div className="space-y-3">
                  <div className="inline-flex p-4 bg-indigo-600 rounded text-white mb-2 shadow-lg">
                    <Github className="h-12 w-12" />
                  </div>
                  <h2 className="font-display font-extrabold text-3xl md:text-4xl text-[#f0f6fc] tracking-tight">
                    AI GITHUB ANALYZER
                  </h2>
                  <p className="text-[#8b949e] max-w-lg mx-auto text-sm md:text-base leading-relaxed">
                    Gain immediate, actionable senior engineering insights into any public GitHub project. Audit core architectures, identify bugs, investigate security, and extract refactoring items automatically.
                  </p>
                </div>

                {/* Popular repos Quickstarts */}
                <div className="space-y-4 pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400">
                    Select a Popular Repository to Start Instantly
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {POPULAR_REPOS.map((repo) => (
                      <div
                        key={repo.fullName}
                        onClick={() => handleQuickstart(repo.fullName)}
                        className="p-4 rounded-xl text-left cursor-pointer transition-all group flex flex-col justify-between card"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <h4 className="font-mono text-sm font-semibold text-[#f0f6fc] group-hover:text-indigo-400 transition-colors truncate">
                              {repo.label}
                            </h4>
                            <span className="text-[10px] bg-indigo-950/50 text-indigo-400 px-2 py-0.5 rounded font-mono font-bold border border-indigo-800/40">
                              {repo.languages[0]}
                            </span>
                          </div>
                          <p className="text-xs text-[#8b949e] line-clamp-2 leading-relaxed">
                            {repo.description}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[#8b949e] mt-3 font-mono">
                          <span className="flex items-center font-semibold text-[#c9d1d9]">
                            <Star className="h-3.5 w-3.5 mr-1 text-amber-500 fill-amber-500" />
                            {(repo.stars / 1000).toFixed(1)}k stars
                          </span>
                          <span className="flex items-center text-indigo-400 group-hover:translate-x-1 transition-transform font-bold">
                            Quick-audit <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Interactive Direct Search Bar */}
                <div className="p-4 rounded-xl max-w-lg mx-auto flex space-x-2 card w-full">
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="Or paste repo URL: https://github.com/expressjs/express"
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/35 font-mono transition-colors"
                  />
                  <button
                    onClick={() => fetchRepoDetails(repoUrl)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-4 py-2 font-display text-xs font-bold cursor-pointer transition-colors shrink-0 border border-indigo-700"
                  >
                    Load Repo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading Repo Details State */}
          {loadingRepo && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0d1117]">
              <div className="space-y-4 text-center">
                <Loader2 className="h-10 w-10 text-indigo-400 animate-spin animate-infinite mx-auto" />
                <div>
                  <h3 className="font-display text-lg font-bold text-[#f0f6fc]">Fetching Repository Details</h3>
                  <p className="text-sm text-[#8b949e] max-w-sm mt-1 leading-relaxed">
                    Retrieving manifest directories, code branches, and structuring file explorer trees...
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Active Worksite Pane (Once Repo is loaded) */}
          {metadata && !loadingRepo && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Repository Quick Banner Info */}
              <div className="bg-white/[0.02] border-b border-white/10 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 backdrop-blur-md">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h2 className="font-display font-bold text-sm text-white">
                      Active: {metadata.fullName}
                    </h2>
                    <span className="text-[10px] bg-white/[0.05] text-[#c9d1d9] border border-white/10 px-1.5 py-0.5 rounded font-mono font-semibold">
                      {targetBranch || metadata.defaultBranch}
                    </span>
                    <a
                      href={metadata.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#8b949e] hover:text-[#f0f6fc] transition-colors"
                    >
                      <Github className="h-4 w-4" />
                    </a>
                  </div>
                  <p className="text-xs text-[#8b949e] line-clamp-1 max-w-xl">
                    {metadata.description || "No description provided."}
                  </p>
                </div>

                {/* Repo stats block */}
                <div className="flex items-center space-x-4 text-xs font-mono">
                  <button
                    onClick={() => {
                      setMetadata(null);
                      setFileTree([]);
                      setFilesContent({});
                      setRawAnalysis("");
                    }}
                    className="text-xs text-[#8b949e] hover:text-[#f0f6fc] flex items-center space-x-1 cursor-pointer bg-white/[0.05] border border-white/10 rounded px-2.5 py-1.5 transition-colors hover:bg-white/[0.12]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="font-bold uppercase tracking-wider text-[10px]">Reset</span>
                  </button>
                </div>
              </div>

              {/* Central Area: Analysis output OR File Content Previewer */}
              <div className="flex-1 flex overflow-hidden">
                {/* 1. If actively analyzing, show loading progression */}
                {analyzing && (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0d1117] overflow-y-auto">
                    <div className="max-w-md w-full space-y-6">
                      <div className="text-center space-y-2">
                        <Loader2 className="h-10 w-10 text-indigo-400 animate-spin animate-infinite mx-auto" />
                        <h3 className="font-display text-lg font-bold text-[#f0f6fc]">Conducting Deep-Dive Audit</h3>
                        <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest">
                          Gemini 3.5 Flash Model Active
                        </p>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-2">
                        <div className="h-2 bg-[#21262d] rounded-full overflow-hidden border border-[#30363d]">
                          <motion.div
                            className="h-full bg-indigo-600"
                            initial={{ width: "0%" }}
                            animate={{ width: `${analysisProgress}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] font-mono text-[#8b949e]">
                          <span>{analysisStep}</span>
                          <span>{analysisProgress}%</span>
                        </div>
                      </div>

                      {/* Static instructional guides to educate the developer */}
                      <div className="p-4 rounded space-y-3 card">
                        <h4 className="text-xs font-bold text-white flex items-center space-x-1.5 uppercase tracking-wider">
                          <Info className="h-3.5 w-3.5 text-indigo-400" />
                          <span>Auditor Scope Focus</span>
                        </h4>
                        <ul className="text-[11px] text-white/90 space-y-2 list-disc pl-4 leading-normal">
                          <li>Reviewing architectural hierarchy, entry-points, and boot routes.</li>
                          <li>Scanning package configurations for technical debt and dependency gaps.</li>
                          <li>Evaluating file reading parameters, lifecycle re-renders, and memory leaks.</li>
                          <li>Inspecting input sanitization and hardcoded secrets.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. If Analysis is completed, show Gemini report */}
                {!analyzing && rawAnalysis && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Interactive Sub-Navigation for sections */}
                    <div className="bg-white/[0.02] border-b border-white/10 px-6 py-2.5 flex flex-wrap gap-2 items-center justify-between backdrop-blur-md">
                      <div className="flex flex-wrap gap-1">
                        {parsedSections ? (
                          <>
                            <button
                              onClick={() => setActiveTab("overview")}
                              className={`px-3 py-1.5 rounded text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer border ${
                                activeTab === "overview"
                                  ? "bg-indigo-600 text-white border-indigo-700 font-bold"
                                  : "text-[#8b949e] hover:bg-white/[0.08] hover:text-white border-transparent"
                              }`}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>1. Overview</span>
                            </button>
                            <button
                              onClick={() => setActiveTab("structure")}
                              className={`px-3 py-1.5 rounded text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer border ${
                                activeTab === "structure"
                                  ? "bg-indigo-600 text-white border-indigo-700 font-bold"
                                  : "text-[#8b949e] hover:bg-white/[0.08] hover:text-white border-transparent"
                              }`}
                            >
                              <Layers className="h-3.5 w-3.5" />
                              <span>2. Structure</span>
                            </button>
                            <button
                              onClick={() => setActiveTab("codeQuality")}
                              className={`px-3 py-1.5 rounded text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer border ${
                                activeTab === "codeQuality"
                                  ? "bg-indigo-600 text-white border-indigo-700 font-bold"
                                  : "text-[#8b949e] hover:bg-white/[0.08] hover:text-white border-transparent"
                              }`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>3. Quality</span>
                            </button>
                            <button
                              onClick={() => setActiveTab("securityPerf")}
                              className={`px-3 py-1.5 rounded text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer border ${
                                activeTab === "securityPerf"
                                  ? "bg-indigo-600 text-white border-indigo-700 font-bold"
                                  : "text-[#8b949e] hover:bg-white/[0.08] hover:text-white border-transparent"
                              }`}
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                              <span>4. Audit</span>
                            </button>
                            <button
                              onClick={() => setActiveTab("actionable")}
                              className={`px-3 py-1.5 rounded text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer border ${
                                activeTab === "actionable"
                                  ? "bg-indigo-600 text-white border-indigo-700 font-bold"
                                  : "text-[#8b949e] hover:bg-white/[0.08] hover:text-white border-transparent"
                              }`}
                            >
                              <Lightbulb className="h-3.5 w-3.5" />
                              <span>5. Actions</span>
                            </button>
                          </>
                        ) : null}
                        <button
                          onClick={() => setActiveTab("raw")}
                          className={`px-3 py-1.5 rounded text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer border ${
                            activeTab === "raw" || !parsedSections
                              ? "bg-indigo-600 text-white border-indigo-700 font-bold"
                              : "text-[#8b949e] hover:bg-white/[0.08] hover:text-white border-transparent"
                          }`}
                        >
                          <Terminal className="h-3.5 w-3.5" />
                          <span>Full Markdown</span>
                        </button>
                      </div>

                      {/* Toolbars with Split View Comparison and Downloads */}
                      <div className="flex items-center space-x-2">
                        {savedAudits.length > 0 && (
                          <button
                            onClick={() => {
                              setCompareMode(!compareMode);
                              if (!compareAuditId && savedAudits.length > 0) {
                                // Default to selecting the oldest or another item from history
                                const otherAudits = savedAudits.filter(a => a.analysis !== rawAnalysis);
                                if (otherAudits.length > 0) {
                                  setCompareAuditId(otherAudits[0].id);
                                } else {
                                  setCompareAuditId(savedAudits[0].id);
                                }
                              }
                            }}
                            className={`p-1.5 border rounded transition-colors cursor-pointer flex items-center space-x-1.5 text-xs font-mono font-bold ${
                              compareMode
                                ? "bg-indigo-600 border-indigo-700 text-white"
                                : "bg-white/[0.05] hover:bg-white/[0.12] border-white/10 text-white"
                            }`}
                            title="Compare side-by-side with a previous audit in history"
                          >
                            <Columns className="h-3.5 w-3.5" />
                            <span className="text-[10px] uppercase tracking-wider">Compare Split-View</span>
                          </button>
                        )}
                        <button
                          onClick={handleCopy}
                          className="p-1.5 bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 rounded text-[#c9d1d9] hover:text-[#f0f6fc] transition-colors cursor-pointer flex items-center space-x-1"
                          title="Copy full markdown report"
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                          <span className="text-[10px] font-mono font-bold uppercase">{copied ? "Copied" : "Copy"}</span>
                        </button>
                        <button
                          onClick={handleDownload}
                          className="p-1.5 bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 rounded text-[#c9d1d9] hover:text-[#f0f6fc] transition-colors cursor-pointer flex items-center space-x-1"
                          title="Download Markdown File"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-mono font-bold uppercase">Download</span>
                        </button>
                      </div>
                    </div>

                    {/* Report Output Content Block (Supports Side-By-Side Grid when in Compare Mode) */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-transparent">
                      <div className={compareMode ? "w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6" : "max-w-4xl mx-auto"}>
                        
                        {/* LEFT COLUMN: ACTIVE AUDIT REPORT */}
                        <div className={`space-y-6 ${compareMode ? "card p-6" : ""}`}>
                          {compareMode && (
                            <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                              <div>
                                <span className="text-[10px] bg-emerald-950/50 text-emerald-400 font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-emerald-800/30">Active Analysis</span>
                                <h3 className="text-sm font-bold text-white mt-1">{metadata.fullName}</h3>
                              </div>
                              <span className="text-xs text-[#8b949e] font-mono font-medium">Currently Selected</span>
                            </div>
                          )}

                          {/* Summary Header Card */}
                          <div className="p-4 rounded flex items-start space-x-3 card">
                            <Shield className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Gemini Auditor Overview</h4>
                              <p className="text-xs text-white/90 leading-relaxed">
                                This analysis represents a deep-dive code and architectural review of the selected files in the <span className="text-[#f0f6fc] font-bold font-mono">{metadata.fullName}</span> repository. Review suggestions are optimized for enterprise code design, maintainability, performance safety, and clean open-source contributions.
                              </p>
                            </div>
                          </div>

                          {/* Rendering active tab markdown */}
                          <div className="markdown-body">
                            {activeTab === "raw" || !parsedSections ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {rawAnalysis}
                              </ReactMarkdown>
                            ) : (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {parsedSections[activeTab]}
                              </ReactMarkdown>
                            )}
                          </div>
                        </div>

                        {/* RIGHT COLUMN: PREVIOUS AUDIT REPORT (COMPARE MODE TARGET) */}
                        {compareMode && (
                          <div className="p-6 space-y-6 flex flex-col justify-start card">
                            <div className="border-b border-white/10 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex-1">
                                <span className="text-[10px] bg-indigo-950/50 text-indigo-400 font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-indigo-800/40">Compare Target</span>
                                <div className="mt-1 flex items-center">
                                  <select
                                    value={compareAuditId}
                                    onChange={(e) => setCompareAuditId(e.target.value)}
                                    className="w-full text-xs bg-white/[0.04] border border-white/10 rounded p-1.5 font-sans text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                                  >
                                    {savedAudits.map((audit) => (
                                      <option key={audit.id} value={audit.id} className="bg-[#161b22] text-[#f0f6fc]">
                                        {audit.repoName} ({audit.timestamp})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <button
                                onClick={() => setCompareMode(false)}
                                className="text-[10px] text-[#8b949e] hover:text-[#f0f6fc] font-bold flex items-center space-x-1 cursor-pointer transition-colors pt-2 sm:pt-0 self-end sm:self-center"
                              >
                                <X className="h-4 w-4" />
                                <span>Close split</span>
                              </button>
                            </div>

                            {(() => {
                              const targetAudit = savedAudits.find(a => a.id === compareAuditId);
                              if (!targetAudit) {
                                return (
                                  <div className="p-8 text-center text-[#8b949e] font-sans">
                                    Please select a valid comparison report from the dropdown list.
                                  </div>
                                );
                              }

                              const targetParsed = parseAnalysisSections(targetAudit.analysis);

                              return (
                                <div className="space-y-6">
                                  {/* Compare target custom focus if exists */}
                                  {targetAudit.customFocus && (
                                    <div className="p-3 bg-white/[0.02] border border-white/10 rounded text-xs text-[#c9d1d9]">
                                      <span className="font-bold text-indigo-400 uppercase text-[9px] tracking-wider block">Custom Audit Focus used:</span>
                                      <p className="mt-1 italic leading-relaxed">{targetAudit.customFocus}</p>
                                    </div>
                                  )}

                                  <div className="p-4 rounded flex items-start space-x-3 card">
                                    <History className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                      <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Historical Run</h4>
                                      <p className="text-xs text-white/90 leading-relaxed">
                                        Audited on <span className="font-bold">{targetAudit.timestamp}</span> with {targetAudit.selectedFilesCount} target files.
                                      </p>
                                    </div>
                                  </div>

                                  <div className="markdown-body">
                                    {activeTab === "raw" || !targetParsed ? (
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {targetAudit.analysis}
                                      </ReactMarkdown>
                                    ) : (
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {targetParsed[activeTab]}
                                      </ReactMarkdown>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Default state (No analysis triggered yet): Show either File Previewer OR Welcome workspace guidance */}
                {!analyzing && !rawAnalysis && (
                  <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
                    {activePreviewFile ? (
                      // Interactive code file preview window
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="bg-white/[0.02] border-b border-white/10 px-6 py-3 flex items-center justify-between backdrop-blur-md">
                          <div className="flex items-center space-x-2 font-mono text-xs">
                            <FileCode className="h-4 w-4 text-indigo-400" />
                            <span className="text-white font-bold">{activePreviewFile}</span>
                            {filesContent[activePreviewFile]?.truncated && (
                              <span className="text-[10px] bg-amber-950/50 text-amber-400 border border-amber-900/40 px-1.5 py-0.5 rounded font-bold">
                                Truncated
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setFileTree(prev =>
                                prev.map(f =>
                                  f.path === activePreviewFile ? { ...f, selected: !f.selected } : f
                                )
                              );
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer border ${
                              fileTree.find(f => f.path === activePreviewFile)?.selected
                                ? "bg-indigo-950/50 border border-indigo-800/50 text-indigo-300 font-semibold"
                                : "bg-white/[0.05] border border-white/10 text-white hover:text-white hover:bg-white/[0.12]"
                            }`}
                          >
                            {fileTree.find(f => f.path === activePreviewFile)?.selected ? "Selected for Audit" : "Select for Audit"}
                          </button>
                        </div>

                        <div className="flex-1 overflow-auto p-4 font-mono text-xs text-white bg-transparent">
                          {filesContent[activePreviewFile] ? (
                            filesContent[activePreviewFile].error ? (
                              <div className="p-4 text-red-400 flex items-center space-x-2">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <span>{filesContent[activePreviewFile].content}</span>
                              </div>
                            ) : (
                              <pre className="p-0 bg-transparent border-none text-left">
                                <code className="language-typescript leading-relaxed block whitespace-pre">
                                  {filesContent[activePreviewFile].content}
                                </code>
                              </pre>
                            )
                          ) : (
                            <div className="flex items-center justify-center h-full text-slate-400">
                              <Loader2 className="h-5 w-5 animate-spin animate-infinite mr-2" />
                              <span>Loading file content from GitHub...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      // Default instructions welcome screen (once repo metadata is loaded)
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-xl mx-auto space-y-6">
                        <div className="p-4 bg-indigo-950/50 border border-indigo-900/30 text-indigo-400 rounded-full">
                          <Eye className="h-10 w-10" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-display text-lg font-bold text-[#f0f6fc]">Repository Details Loaded</h3>
                          <p className="text-sm text-[#8b949e] leading-relaxed">
                            The repository structure was read successfully. We pre-selected <span className="text-[#f0f6fc] font-semibold">{fileTree.filter(f => f.type === "file" && f.selected).length} critical source configuration files</span> (e.g. package.json, main entry files, README) to audit.
                          </p>
                        </div>

                        <div className="p-4 rounded-xl text-left w-full space-y-3 font-mono text-xs text-white card">
                          <div className="font-bold text-indigo-400 flex items-center">
                            <Info className="h-3.5 w-3.5 mr-1.5" /> Quick Workflow Tips:
                          </div>
                          <ul className="space-y-1.5 list-disc pl-4 text-white/80">
                            <li>Click any file in the left explorer list to inspect its source code.</li>
                            <li>Toggle checkboxes to include/exclude specific files from the Gemini audit scope.</li>
                            <li>Add a custom question or refactor focus in the bottom text field.</li>
                            <li>Click the <span className="text-indigo-400 font-bold">"Run Deep-Dive Audit"</span> button to generate your structured 5-part engineering review.</li>
                          </ul>
                        </div>

                        <button
                          onClick={handleRunAnalysis}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 rounded px-6 py-2.5 font-display text-xs font-bold cursor-pointer transition-colors shadow-lg"
                        >
                          Run Audit with Selected Files ({fileTree.filter(f => f.selected).length})
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
