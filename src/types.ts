export interface RepoMetadata {
  owner: string;
  repo: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  defaultBranch: string;
  languages: string[];
  size: number;
  updatedAt: string;
  htmlUrl: string;
}

export interface FileTreeItem {
  path: string;
  type: "file" | "directory";
  size: number;
  selected?: boolean;
}

export interface FileData {
  content: string;
  error?: boolean;
  truncated?: boolean;
}

export interface FileContentMap {
  [path: string]: FileData;
}

export interface AnalysisResponse {
  analysis: string;
}

export interface SavedAudit {
  id: string;
  repoName: string;
  branch: string;
  timestamp: string;
  analysis: string;
  customFocus: string;
  selectedFilesCount: number;
}

