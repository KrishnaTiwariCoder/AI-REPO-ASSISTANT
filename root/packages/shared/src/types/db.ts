

export type RepoStatus = 'pending' | 'ready' | 'failed';

export type JobStatus =
  | 'queued'
  | 'cloning'
  | 'parsing'
  | 'indexing'
  | 'done'
  | 'failed';

export type SymbolKind = 'function' | 'class' | 'method' | 'const' | 'import';

export type EdgeType = 'calls' | 'imports';

export type Repo = {
  id: string;
  url: string;
  status: RepoStatus;
  size_bytes: number | null;
  last_commit_sha: string | null;
  created_at: number;
}

export type Job = {
  id: string;
  repo_id: string;
  status: JobStatus;
  progress_pct: number;
  error: string | null;
  files_parsed: number;
  symbol_count: number;
  edge_count: number;
  duration_ms: number | null;
  created_at: number;
  updated_at: number;
}

export type FileRecord = {
  id: string;
  repo_id: string;
  path: string;
  content: string;
  hash: string;
}

export type CodeSymbol = {
  id: string;
  file_id: string;
  name: string;
  kind: SymbolKind;
  line_start: number;
  line_end: number;
  signature: string | null;
  docstring: string | null;
}

export type Edge = {
  id: string;
  from_symbol_id: string;
  to_symbol_id: string;
  edge_type: EdgeType;
}

export type CacheEntry = {
  id: string;
  repo_id: string;
  query_normalized: string;
  query_original: string;
  answer: string;
  source_symbol_ids: string; 
  source_file_hashes: string;
  created_at: number;
}

export interface CacheEntryParsed extends Omit<CacheEntry, 'source_symbol_ids' | 'source_file_hashes'> {
  source_symbol_ids: string[];
  source_file_hashes: Record<string, string>;
}


export type SubmitRepoResponse ={
  repoId: string;
  jobId: string;
}

export type JobStatusResponse ={
  jobId: string;
  status: JobStatus;
  progressPct: number;
  error: string | null;
  metrics: {
    filesParsed: number;
    symbolCount: number;
    edgeCount: number;
    durationMs: number | null;
  };
}

export type ChatMessageRequest ={
  question: string;
}

export type RetrievedSource= {
  symbolName: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
}

export type ChatMessageResponse ={
  answer: string;
  sources: RetrievedSource[];
  servedFromCache: boolean;
}

export type RefreshRepoResponse= {
  changed: boolean; 
  jobId: string | null; 
}