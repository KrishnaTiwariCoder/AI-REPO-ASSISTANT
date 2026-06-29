
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | ready | failed
  size_bytes INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id),
  status TEXT NOT NULL DEFAULT 'queued', -- queued|cloning|parsing|indexing|done|failed
  progress_pct INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  files_parsed INTEGER DEFAULT 0,
  symbol_count INTEGER DEFAULT 0,
  edge_count INTEGER DEFAULT 0,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id),
  path TEXT NOT NULL,
  hash TEXT NOT NULL
);

CREATE TABLE symbols (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,         
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  signature TEXT,
  docstring TEXT
);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  from_symbol_id TEXT NOT NULL REFERENCES symbols(id),
  to_symbol_id TEXT NOT NULL REFERENCES symbols(id),
  edge_type TEXT NOT NULL     
);

CREATE TABLE cache (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id),
  query_normalized TEXT NOT NULL,
  query_original TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_symbol_ids TEXT,     
  source_file_hashes TEXT,    
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_files_repo_id ON files(repo_id);
CREATE INDEX idx_symbols_file_id ON symbols(file_id);
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_edges_from_symbol ON edges(from_symbol_id);
CREATE INDEX idx_edges_to_symbol ON edges(to_symbol_id);
CREATE INDEX idx_jobs_repo_id ON jobs(repo_id);
CREATE INDEX idx_cache_repo_query ON cache(repo_id, query_normalized);