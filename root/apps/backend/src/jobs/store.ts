import { randomUUID } from "node:crypto"
import { db } from "../db/connection"
import type { Job } from "@ai-repo-assistant/shared"

export function insertJob(repoId: string): Job {
    const now = Math.floor(Date.now() / 1000)
    const job: Job = {
        id: randomUUID(),
        repo_id: repoId,
        status: "queued",
        progress_pct: 0,
        error: null,
        files_parsed: 0,
        symbol_count: 0,
        edge_count: 0,
        duration_ms: null,
        created_at: now,
        updated_at: now,
    }

    db.prepare(
        `INSERT INTO jobs (id, repo_id, status, progress_pct, error, files_parsed, symbol_count, edge_count, duration_ms, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        job.id,
        job.repo_id,
        job.status,
        job.progress_pct,
        job.error,
        job.files_parsed,
        job.symbol_count,
        job.edge_count,
        job.duration_ms,
        job.created_at,
        job.updated_at
    )

    return job
}

 
export type JobUpdate = Partial<
    Pick<Job, "status" | "progress_pct" | "error" | "files_parsed" | "symbol_count" | "edge_count" | "duration_ms">
>
 
export function updateJob(jobId: string, updates: JobUpdate): void {
    const now = Math.floor(Date.now() / 1000);
    
    const fields = { ...updates, updated_at: now }
    const keys = Object.keys(fields) as (keyof typeof fields)[]
    const setClauses = keys.map((k) => `${k} = ?`).join(", ")
    const values = keys.map((k) => fields[k])
 
    db.prepare(`UPDATE jobs SET ${setClauses} WHERE id = ?`).run(...values, jobId)
}
 
 
export function setJobCloning(jobId: string): void {
    updateJob(jobId, { status: "cloning", progress_pct: 5 })
}
 
export function setJobFailed(jobId: string, error: string): void {
    updateJob(jobId, { status: "failed", error })
}
 
export function setJobDone(
    jobId: string,
    metrics: Pick<Job, "files_parsed" | "symbol_count" | "edge_count" | "duration_ms">
): void {
    updateJob(jobId, { status: "done", progress_pct: 100, ...metrics })
}