# ai-repo-assistant — Agentic Codebase Assistant

> Paste a public GitHub repo URL, watch it get indexed into a structural code graph, then chat with an assistant that actually understands your codebase — no embeddings, no vector DB, just deterministic lexical + graph-traversal retrieval feeding an LLM.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Key Design Decisions](#key-design-decisions)
3. [Feature List](#feature-list)
4. [Tech Stack](#tech-stack)
5. [Dependency Explanations](#dependency-explanations)
6. [Indexing Pipeline](#indexing-pipeline)
7. [Retrieval Strategy](#retrieval-strategy)
8. [Query Cache Strategy](#query-cache-strategy)
9. [Eval Harness](#eval-harness)
10. [Project Structure](#project-structure)
11. [v2 Roadmap (Deferred Scope)](#v2-roadmap-deferred-scope)
12. [Setup Guide](#setup-guide)

---

## Architecture Overview

The platform is a **TurboRepo monorepo** with `apps/web` (Next.js), `apps/backend` (Hono API + indexing engine), and `packages/shared` (types shared across both).

```
Client (Next.js + TypeScript)
        │
        ├── HTTP REST ──────────────► Hono API Server ◄──── SQLite
        │   (submit repo, poll job,            │              (jobs, symbols,
        │    chat)                             │               edges, cache,
        │                                      │               eval results)
        │                                      │
        │                              Indexing Pipeline
        │                              ├── Ephemeral shallow clone
        │                              ├── tree-sitter parse (2-pass)
        │                              ├── Symbol/edge graph builder
        │                              └── Delete clone, keep graph
        │
        └── Chat ───────────────────► LangGraph Agent
            (ask question)              ├── Cache lookup (hash-validated)
                                         ├── Lexical search (SQLite, indexed)
                                         ├── Candidate ranking
                                         ├── Graph traversal expansion
                                         ├── LLM synthesis (only here)
                                         └── Write-through to cache
```

### Key Design Decisions

**No vector DB, no embeddings in the retrieval path.** Retrieval queries the already-indexed `symbols`/`files` tables directly in SQLite (`LIKE` matching for v1, FTS5 as a later upgrade), ranks the resulting candidates, then expands via graph traversal (callers, callees, imports) from the top candidates. This is deterministic, explainable, and free of embedding infrastructure. The LLM is used **only at the synthesis step**, never to decide what to retrieve.

**Retrieval never touches the filesystem.** Because the cloned repo is deleted right after indexing, retrieval cannot shell out to `ripgrep` at query time — there's nothing on disk to search. `ripgrep` is used only *during indexing*, while the clone still exists; once a repo is indexed, every chat question is answered purely from SQLite-stored metadata. This was a real gap in the original design, not a style choice — without it, every chat question would have required re-cloning the repo, defeating the point of the ephemeral-clone model.

**Symbol resolution is two-pass.** Pass 1 walks every file and collects all symbols into the `symbols` table. Pass 2 resolves call sites and imports into `edges`, now that every symbol in the repo — regardless of which file or how far below its usage it's defined — already exists in the table. Single-pass resolution would silently miss edges where a symbol is used before (or in a different file from) where it's defined, quietly degrading retrieval quality in a way that's hard to trace back to its cause.

**Clone is ephemeral, shallow, and size-capped.** Repos are never persisted on disk after indexing. `git clone --depth 1` pulls a snapshot only (no history), the repo size is checked against GitHub's API before cloning (reject if over a configurable cap), and the cloned directory is deleted immediately after the symbol graph is extracted. Only the graph (rows in SQLite) survives — not the source tree.

**Indexing is a background job, not a blocking request.** Submitting a repo returns a `job_id` immediately. A `jobs` table in SQLite tracks `status` (queued → cloning → parsing → indexing → done/failed) and `progress_pct`. The frontend polls for status and renders progress. No external queue/worker infra in v1 — see [v2 Roadmap](#v2-roadmap-deferred-scope) for Redis + BullMQ.

**The query cache is structured data, not Markdown.** Cached answers live in a SQLite table, keyed by a normalized query plus the repo's current state. Each cache entry stores `source_file_hashes` — if the repo has been re-indexed since the entry was cached, the entry is invalidated rather than served stale.

**MCP and GitHub OAuth are explicitly out of scope for v1.** Both are real, valuable additions, but neither is required to prove out the core retrieval/agent loop, and both add infrastructure (auth flows, protocol plumbing) that would dilute focus on the part of this project meant to teach retrieval and agent design. They are scoped precisely in the v2 section.

**Deliberately rejected (not just deferred):** a separate symbol-graph/file-graph schema split (the existing `edge_type` discriminator column on `edges` already covers this without a second table), LLM-generated file summaries at index time (would violate the "LLM only at synthesis" principle and add a model call per file to every indexing run), a `package.json` dependency graph, and a cosmetic per-repo language-percentage table. Each was considered and is either redundant with something already in the schema, or doesn't serve the core retrieval/agent learning goals of this project.

---

## Feature List

### Repo Connection & Indexing

- Submit a public GitHub repo URL
- Pre-clone size check against GitHub API; reject oversized repos with a clear message
- Ephemeral shallow clone (`--depth 1`), deleted immediately after parsing
- tree-sitter-based two-pass parsing into a symbol table (functions, classes, methods, imports) — pass 1 collects symbols, pass 2 resolves edges
- Call-graph and import-graph edge extraction between symbols
- Per-symbol docstring/leading-comment capture alongside signature
- Background job with live status (`queued` → `cloning` → `parsing` → `indexing` → `done`/`failed`)
- Indexing metrics captured per job (files parsed, symbol count, edge count, duration)
- Polling-based progress UI, no page refresh needed

### Chat / Q&A

- Chat interface scoped to a single indexed repo
- User asks a natural-language question about the codebase
- Lexical search against indexed `symbols`/`files` tables (no filesystem access — the clone is already gone by this point)
- Candidate ranking (exact name match > partial match > path match) before traversal
- Graph traversal expands from top-ranked candidates (callers, callees, related imports) to assemble context
- Context + question sent to an LLM via a LangGraph agent (Plan → Retrieve → Reflect → Synthesize)
- Response includes which files/symbols were used, for transparency
- Repeated/similar questions served from cache when the underlying files haven't changed

### Eval Harness

- A hand-written set of repo-specific Q&A pairs per sample repo
- Automated runner scores retrieval accuracy (did it pull the right files/symbols) and answer quality
- Used to validate retrieval-strategy changes don't regress accuracy

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Package manager | pnpm | Standard for Turborepo, avoids phantom dependencies, fast monorepo installs |
| Monorepo | TurboRepo | Shared types, build caching, parallel task execution |
| Frontend | Next.js + TypeScript | File-based routing, minimal config for the submit/progress/chat flows |
| Backend | Hono + TypeScript | Lightweight, fully TS-native, runs as a standalone long-lived Node process (required for background jobs and native modules — not a fit for serverless/edge runtimes) |
| Parsing | `web-tree-sitter` (WASM) | Cross-platform grammar loading without native build toolchain issues |
| Indexing-time file search | ripgrep (via `execa`) | Used only while the clone still exists on disk, during indexing — never at chat/retrieval time |
| Query-time lexical search | SQLite `LIKE` (FTS5 later) | Runs directly against indexed `symbols`/`files` tables; works after the clone has been deleted |
| Database | SQLite (`better-sqlite3`) | Single embedded DB for jobs, symbol graph, cache, eval results — zero ops |
| Agent orchestration | LangGraph.js | Explicit Plan/Retrieve/Reflect/Synthesize state machine with conditional loops |
| LLM access | Provider-agnostic client (Anthropic SDK / OpenAI-compatible) | Swappable between free-tier providers (Gemini, Groq) and Anthropic during dev |

---

## Dependency Explanations

### Frontend (`apps/web`)

**`next`** — Server actions handle repo submission and job-status polling without a separate API client layer; file-based routing keeps the chat and submission flows simple.

**`typescript`** — Shared types for job status, chat messages, and API responses come from `packages/shared`.

### Backend (`apps/backend`)

**`hono`** — REST endpoints: submit repo, poll job, send chat message. Runs as a standalone Node process (not serverless), which is required for long-running background jobs, native modules, and subprocess spawning.

**`web-tree-sitter`** — Parses source files into ASTs across languages via WASM grammars; the basis for symbol/edge extraction. Runs in two passes per repo: symbol collection, then edge resolution.

**`execa`** — Runs `git clone` and `ripgrep` as subprocesses, used only during the indexing stage while the clone still exists on disk. Never invoked during chat/retrieval — by that point the clone has already been deleted.

**`better-sqlite3`** — Synchronous SQLite driver. Fast enough for this workload (no async overhead needed on local file-based queries) and simplifies the job-polling, lexical-search, and cache-lookup code paths.

**`@langchain/langgraph`** — Defines the agent as an explicit graph of nodes (Plan, Retrieve, Reflect, Synthesize, Verify) with conditional edges for retry loops, rather than a single linear prompt chain.

### Monorepo

**`turbo`** — Coordinates `apps/web` and `apps/backend` dev/build tasks, with `packages/shared` built first as a dependency.

---

## Indexing Pipeline

1. **Validate** — Check the repo exists via GitHub API; check `size` field against a configured cap (e.g. 200MB); reject early if too large.
2. **Clone** — `git clone --depth 1 <url> <tmp-dir>`. Shallow clone only — no history needed for structural indexing.
3. **Parse (pass 1 — collect symbols)** — Walk the cloned tree, parse each source file with `web-tree-sitter`, and record every function, class, method, top-level variable, and import/export — with file path, line range, signature, and docstring/leading comment — into the `symbols` table. Don't resolve any references yet.
4. **Parse (pass 2 — resolve edges)** — Now that every symbol in the repo exists in the table, resolve call sites and import statements into `(from_symbol, to_symbol, edge_type)` rows. Running this as a second pass avoids missing edges where a symbol is used before, or in a different file from, where it's defined.
5. **Persist** — Write `files`, `symbols`, and `edges` rows into SQLite. Compute and store each file's content hash for later cache invalidation.
6. **Record metrics** — Store files-parsed, symbol count, edge count, and total duration on the `jobs`/`repos` row.
7. **Cleanup** — Delete the cloned directory. Only the graph remains.
8. **Mark done** — Update the job row to `status = 'done'`.

Each stage updates `jobs.progress_pct` so the frontend can show meaningful progress, not just a spinner.

---

## Retrieval Strategy

Given a user's question:

1. **Normalize** the question (lowercase, strip stopwords, tokenize).
2. **Lexical search** — query the indexed `symbols`/`files` tables directly in SQLite (`LIKE` matching for v1; FTS5 is a documented upgrade path once ranking quality needs it) against names, identifiers, and file paths. This runs entirely against indexed metadata — by the time a chat question arrives, the cloned repo no longer exists on disk, so retrieval cannot and does not shell out to the filesystem.
3. **Candidate ranking** — rank the lexical matches (exact name match > partial match > path match) before traversal, so a question that matches several similarly-named symbols doesn't expand from all of them indiscriminately.
4. **Graph traversal expansion** — from the top-ranked candidates, walk `edges` (callers, callees, imports) outward by a bounded number of hops to assemble a relevant subgraph.
5. **Assemble context** — pull the stored signature/docstring (and source snippet) for the symbols/files in the resulting subgraph.
6. **Synthesize** — only at this final step does an LLM call happen: context + question → answer, with the agent able to loop back to step 2 with a reformulated query if the Reflect node judges the context insufficient (bounded retries).

No embeddings, no vector index, and no filesystem access anywhere in this path.

---

## Query Cache Strategy

A `cache` table in the same SQLite database, not a separate file:

```
cache (
  id, repo_id, query_normalized, query_original,
  answer, source_symbol_ids (json), source_file_hashes (json),
  created_at
)
```

On a new query:

1. Normalize the incoming question the same way as retrieval.
2. Look up an exact/near-exact match scoped to the current `repo_id`.
3. If found, compare `source_file_hashes` against the repo's current indexed state.
4. If hashes still match → serve cached `answer` directly, skip retrieval and the LLM call entirely.
5. If hashes differ (repo re-indexed since) → treat as a cache miss, run full retrieval, overwrite the entry.

This gives a genuine cost/latency win on repeat questions while never silently serving a stale answer.

---

## Eval Harness

- `evals/dataset/<repo-name>.json` — hand-written question/expected-symbols/expected-answer-summary triples for a small set of sample repos.
- `evals/runner.ts` — runs each question through the real retrieval + agent pipeline, checks whether the expected symbols/files appear in the retrieved context, and records pass/fail plus latency.
- Run manually during development whenever retrieval logic changes, to catch regressions before they reach the chat UI.

---

## Project Structure

```
root/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/              # Next.js routes: submit, job status, chat
│   │       ├── components/       # Repo submit form, progress bar, chat panel
│   │       └── hooks/            # useJobStatus (polling), useChat
│   └── backend/
│       └── src/
│           ├── routes/
│           │   ├── repos.ts       # submit repo, get job status
│           │   └── chat.ts        # ask question, get answer
│           ├── indexer/
│           │   ├── clone.ts       # ephemeral shallow clone + size check
│           │   ├── parse.ts       # tree-sitter parsing
│           │   └── graphBuilder.ts # symbol/edge extraction
│           ├── retriever/
│           │   ├── lexical.ts     # SQLite-backed lexical search (symbols/files)
│           │   ├── ranking.ts     # candidate ranking before traversal
│           │   └── graph.ts       # traversal/expansion
│           ├── agent/
│           │   └── graph.ts       # LangGraph: Plan/Retrieve/Reflect/Synthesize
│           ├── cache/
│           │   └── store.ts       # cache table read/write + hash validation
│           ├── jobs/
│           │   └── store.ts       # jobs table read/write
│           └── db/
│               └── schema.ts      # SQLite schema + migrations
├── packages/
│   └── shared/
│       ├── types/                 # Job status, chat message, API response types
│       └── utils/
├── evals/
│   ├── dataset/
│   └── runner.ts
└── turbo.json
```

---

## v2 Roadmap (Deferred Scope)

These are intentionally **not** part of v1. Each is a real, valuable extension, scoped here so v1 stays focused.

- **GitHub OAuth** — connect a GitHub account, support private repos. Requires token storage/encryption and scope management; deliberately deferred since it teaches auth plumbing, not retrieval/agent concepts.
- **MCP integration** — ship a `mcp/server.ts` exposing `search_symbols`, `get_definition`, `get_callers` etc. to any MCP client (Claude Code, Claude Desktop, Cursor). Separately, use the **GitHub MCP server as an MCP client** from the agent — not to fetch file contents (git clone already does that), but to pull **issues, PR discussions, and commit metadata** that git clone alone can't provide.
- **Redis + BullMQ** — replace the SQLite-table job system with a real queue once concurrent indexing load actually requires it. Not needed at v1 scale (one job at a time is fine on a polling SQLite table).
- **Graph database (Kuzu)** — optional swap of the `symbols`/`edges` SQLite tables for an embedded graph DB, if deeper graph-query practice (Cypher-style traversal) becomes a deliberate learning goal.
- **Browser-side or per-user cloning** — avoid server-side cloning entirely (e.g. `isomorphic-git` in-browser) for a more privacy-conscious deployment model.

---

## Setup Guide

### Prerequisites

- Node.js v18+
- pnpm v9+
- `git` and `ripgrep` (`rg`) available on PATH (used during indexing only)

### 1. Clone & Install

```bash
git clone https://github.com/[your-username]/ai-repo-assistant.git
cd ai-repo-assistant
pnpm install
```

### 2. Environment Variables

**`apps/backend/.env`**
```env
PORT=4000
DB_PATH=./data/ai-repo-assistant.db
GITHUB_TOKEN=your_github_token        # for API size checks, higher rate limit
LLM_PROVIDER=gemini                   # or groq / anthropic
LLM_API_KEY=your_key
MAX_REPO_SIZE_MB=200
```

**`apps/web/.env`**
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 3. Build Shared Package

```bash
pnpm --filter @ai-repo-assistant/shared build
```

### 4. Run Development

```bash
pnpm dev
```

Starts the Next.js app on `http://localhost:3000` and the Hono backend on `http://localhost:4000`.

### 5. Run Evals

```bash
pnpm --filter @ai-repo-assistant/backend evals
```