# TODOS — ai-repo-assistant (Agentic Codebase Assistant)

> Ordered roadmap. Work top-to-bottom. Each block is a logical commit or milestone.
> Status: `[ ]` pending · `[x]` done · `[~]` in progress

---

## v0.1.0 — Monorepo Bootstrap

```
chore: initialize TurboRepo with web, backend, shared packages
```

- [x] Init TurboRepo: `apps/web` (Next.js), `apps/backend` (Hono), `packages/shared`
- [x] Configure `turbo.json` pipeline (`build` → `dev` → `lint`)
- [x] Root `package.json` with pnpm workspaces (`pnpm-workspace.yaml`)
- [ ] `.env.example` for both apps
- [ ] `.gitignore` (node_modules, dist, .env, .turbo, data/*.db)
- [ ] Base `tsconfig.json` in `packages/shared`
- [ ] `packages/shared` exports: `JobStatus`, `ChatMessage`, API response types

---

## v0.2.0 — Database & Schema

```
feat: SQLite schema for jobs, symbols, edges, cache, eval results
```

- [ ] `better-sqlite3` setup with a single `data/ai-repo-assistant.db` file
- [ ] `repos` table: `id, url, status, size_bytes, created_at`
- [ ] `jobs` table: `id, repo_id, status, progress_pct, error, files_parsed, symbol_count, edge_count, duration_ms, created_at, updated_at`
- [ ] `files` table: `id, repo_id, path, hash`
- [ ] `symbols` table: `id, file_id, name, kind, line_start, line_end, signature, docstring`
- [ ] `edges` table: `id, from_symbol_id, to_symbol_id, edge_type`
- [ ] `cache` table: `id, repo_id, query_normalized, query_original, answer, source_symbol_ids (json), source_file_hashes (json), created_at`
- [ ] Simple migration runner (just SQL files run in order on boot)

---

## v0.3.0 — Repo Submission & Validation

```
feat: submit a public repo URL, validate before cloning
```

- [ ] `POST /api/v1/repos` — accepts a GitHub repo URL
- [ ] Validate URL format (public GitHub repo, not arbitrary git URL, for v1)
- [ ] Call GitHub API to check repo exists and read `size` field
- [ ] Reject with clear error if `size` exceeds `MAX_REPO_SIZE_MB`
- [ ] Insert `repos` row (`status: 'pending'`) and `jobs` row (`status: 'queued'`)
- [ ] Return `{ repoId, jobId }` to the client immediately (non-blocking)

---

## v0.4.0 — Ephemeral Clone & Cleanup

```
feat: shallow clone repo to temp dir, guaranteed cleanup after indexing
```

- [ ] `git clone --depth 1 <url> <tmp-dir>` via `execa`
- [ ] Update `jobs.status = 'cloning'`, `progress_pct` accordingly
- [ ] Handle clone failures (private repo, repo not found, network error) → `jobs.status = 'failed'`, store `error`
- [ ] Guarantee temp directory deletion after parsing — even on failure (try/finally)
- [ ] Unit test: clone, assert temp dir exists, run cleanup, assert temp dir gone

---

## v0.5.0 — tree-sitter Parsing (Pass 1: Symbol Collection)

```
feat: parse cloned source files into ASTs, collect symbols (no resolution yet)
```

- [ ] Set up `web-tree-sitter` with WASM grammars for at least JS/TS (expand later)
- [ ] Walk cloned file tree, skip `node_modules`, `.git`, binary/non-source files
- [ ] Parse each source file into an AST
- [ ] Collect every function, class, method, top-level const into a symbol list — **do not resolve calls/imports yet**, just record what exists and where
- [ ] Capture signature and leading docstring/comment alongside each symbol
- [ ] Update `jobs.status = 'parsing'`, `progress_pct` per file processed
- [ ] Handle parse errors per-file without failing the whole job (log + skip)
- [ ] Track running counts (files parsed, symbols found so far) for later metrics

---

## v0.6.0 — Symbol & Edge Graph Extraction (Pass 2: Edge Resolution)

```
feat: write collected symbols to SQLite, then resolve call/import edges
```

- [ ] Write all symbols collected in v0.5.0 to the `symbols` table first — every symbol in the repo now exists in the DB before any edge resolution starts
- [ ] **Pass 2**: walk call sites and import statements, resolve each one against the now-complete `symbols` table (this ordering avoids missing edges where a symbol is used before, or in a different file from, where it's defined)
- [ ] Resolve call sites to symbol edges (`calls` edge type)
- [ ] Resolve imports to file-level edges (`imports` edge type)
- [ ] Write `edges` rows to SQLite
- [ ] Compute and store per-file content hash (for later cache invalidation)
- [ ] Update `jobs.status = 'indexing'` during this phase
- [ ] Finalize metrics on the `jobs` row: `files_parsed`, `symbol_count`, `edge_count`

---

## v0.7.0 — Job Completion & Cleanup

```
feat: finalize indexing job, delete cloned source
```

- [ ] Delete the cloned temp directory once graph extraction is complete
- [ ] Record `duration_ms` on the `jobs` row (total time from `queued` to `done`)
- [ ] Update `jobs.status = 'done'`, `progress_pct = 100`
- [ ] Update `repos.status = 'ready'`
- [ ] `GET /api/v1/jobs/:jobId` — returns current status + progress + metrics for polling

---

## v0.8.0 — Frontend: Repo Submission & Progress UI

```
feat: submit-repo form and polling-based indexing progress screen
```

- [ ] `apps/web` page: paste repo URL, submit
- [ ] On submit, call `POST /api/v1/repos`, store `repoId`/`jobId`
- [ ] Progress screen: poll `GET /api/v1/jobs/:jobId` every 1-2s
- [ ] Render stage labels (Cloning → Parsing → Indexing → Done) with `progress_pct`
- [ ] On `status: 'done'` → redirect to chat screen for that repo
- [ ] On `status: 'failed'` → show error message, allow retry

---

## v0.9.0 — Lexical Search (SQLite-backed, no filesystem access)

```
feat: query indexed symbols/files directly in SQLite — no ripgrep at retrieval time
```

- [ ] Normalize incoming question (lowercase, strip stopwords, tokenize)
- [ ] Search `symbols.name` / `files.path` via `LIKE` queries against normalized tokens — note: the cloned repo no longer exists on disk by this point, so this **must** run against indexed metadata only, never a subprocess
- [ ] Return raw candidate matches (unranked) for the next stage
- [ ] (Note for later: this is the place to swap in SQLite FTS5 once `LIKE`-based ranking quality plateaus — not needed for v1)

---

## v0.9.1 — Candidate Ranking

```
feat: rank lexical matches before graph traversal
```

- [ ] Rank candidates: exact name match > partial/substring match > path-only match
- [ ] Cap to top-N ranked candidates (avoid traversing from every loosely-related match)
- [ ] Return top-N ranked symbols as anchors for graph expansion

---

## v0.10.0 — Graph Traversal Expansion

```
feat: expand from ranked anchor symbols via call/import edges
```

- [ ] Given top-ranked anchor symbol IDs (from v0.9.1), traverse `edges` outward (callers + callees) up to N hops
- [ ] Deduplicate and cap total symbols returned (avoid context explosion on hub functions)
- [ ] Pull stored signature/docstring (and source snippet) for the resulting symbol set (file + line range)
- [ ] Return assembled context object: `{ anchors, expandedSymbols, snippets }`

---

## v0.11.0 — LangGraph Agent (Plan/Retrieve/Reflect/Synthesize)

```
feat: agent orchestration loop wrapping retrieval and LLM synthesis
```

- [ ] Set up `@langchain/langgraph` state graph
- [ ] **Plan** node: parse the user's question into a normalized retrieval query
- [ ] **Retrieve** node: call lexical search → candidate ranking → graph traversal (v0.9.0, v0.9.1, v0.10.0)
- [ ] **Reflect** node: LLM judges if assembled context is sufficient; conditional edge loops back to Retrieve with a reformulated query (bounded retries, e.g. max 2)
- [ ] **Synthesize** node: LLM call with question + assembled context → answer
- [ ] **Finalize** node: write result to cache (v0.12.0), return to caller
- [ ] Provider-agnostic LLM client wrapper (swap between Gemini/Groq/Anthropic via env var)

---

## v0.12.0 — Query Cache with Hash Invalidation

```
feat: structured query cache, skip retrieval+LLM on validated cache hit
```

- [ ] On incoming question: normalize, look up `cache` table scoped to `repo_id`
- [ ] On cache hit: compare stored `source_file_hashes` against current `files.hash` for those files
- [ ] If hashes match → return cached `answer` directly, skip retrieval + LLM entirely
- [ ] If hashes differ or no hit → run full agent pipeline (v0.11.0), write new cache row on completion
- [ ] `DELETE`/expire cache rows when a repo is re-indexed (optional: just rely on hash check)

---

## v0.13.0 — Frontend: Chat Interface

```
feat: chat UI scoped to an indexed repo
```

- [ ] Chat page for a given `repoId`, loaded after indexing completes
- [ ] Message input → `POST /api/v1/repos/:repoId/chat`
- [ ] Render assistant response with the files/symbols it used (transparency)
- [ ] Show loading state while agent is running (esp. on cache miss)
- [ ] Message history scoped per session (no persistence required for v1)

---

## v0.14.0 — Eval Harness

```
feat: automated retrieval + answer-quality evaluation
```

- [ ] `evals/dataset/<repo>.json` — hand-written Q&A pairs with expected symbols/files per sample repo
- [ ] `evals/runner.ts` — runs each question through the real pipeline
- [ ] Score: did retrieved context include expected symbols/files (precision/recall)
- [ ] Score: basic answer-quality check (keyword presence or LLM-graded, your choice)
- [ ] Record latency per question
- [ ] Output a simple pass/fail + score summary to console or a markdown report

---

## v1.0.0 — Production Hardening

```
chore: rate limiting, error handling, indexes, Docker setup
```

- [ ] Rate limiting on REST endpoints (Hono rate-limit middleware)
- [ ] Global error handler middleware (structured JSON error responses)
- [ ] SQLite indexes: `repo_id` on `files`, `symbols` (via `file_id`), `edges`, `cache`, `jobs`
- [ ] Environment-aware CORS config
- [ ] Concurrent-job safety check (reject new submission if a job for the same URL is already running)
- [ ] Docker Compose: `web`, `backend` services (SQLite file on a mounted volume)
- [ ] `README.md` setup guide verified end-to-end on a fresh machine
- [ ] Basic load test: a handful of concurrent indexing jobs + chat queries

---

## v1.1.0+ — Deferred to v2 ⚠️

> Not scheduled yet. Listed here so scope stays explicit. Pick these up after v1.0.0 is stable.

- [ ] **GitHub OAuth** — connect account, support private repos, token storage/encryption
- [ ] **MCP server** — expose `search_symbols`, `get_definition`, `get_callers`, etc. to any MCP client
- [ ] **MCP client** — agent calls GitHub's MCP server for issues/PRs/commit metadata (not file contents)
- [ ] **Redis + BullMQ** — replace SQLite-table job tracking with a real queue under concurrent load
- [ ] **Kuzu graph DB** — optional swap of `symbols`/`edges` tables for an embedded graph database
- [ ] **Browser-side/per-user cloning** — remove server-side clone step entirely for privacy
- [ ] Multi-language grammar expansion beyond JS/TS (Python, Go, Rust, etc.)
- [ ] Persisted chat history across sessions
- [ ] Repo re-indexing on demand (detect new commits, re-run pipeline, invalidate cache)

---

## Backlog (Unscheduled)

- [ ] Side-by-side retrieval strategy comparison in the UI (lexical+graph vs embedding fallback)
- [ ] Public repo gallery / "try it on a popular repo" quick-start
- [ ] Shareable chat sessions (read-only link to a Q&A thread)
- [ ] Dark mode UI
- [ ] Export eval report as a published benchmark page

---

## Considered & Rejected (for reference, not scheduled)

> Kept here so future-you doesn't re-debate these from scratch.

- **Separate symbol-graph / file-graph tables** — rejected; the existing `edge_type` column on `edges` already distinguishes `calls` from `imports` without a second schema.
- **LLM-generated file summaries at index time** — rejected; would add a model call per file to every indexing run, violating the "LLM only at synthesis" principle for marginal benefit.
- **`package.json` dependency graph** — rejected for v1; different problem (manifest parsing) than the call/import graph this project is built to teach. Candidate for backlog if revisited.
- **`languages` table / repo language-percentage breakdown** — rejected; cosmetic only, no retrieval or learning value.