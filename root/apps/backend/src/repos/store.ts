import { randomUUID } from "node:crypto"
import { db } from "../db/connection"
import type { Repo } from "@ai-repo-assistant/shared"

export function insertRepo(url: string, sizeBytes: number, lastCommitSha: string): Repo {
    const repo: Repo = {
        id: randomUUID(),
        url,
        status: "pending",
        size_bytes: sizeBytes,
        last_commit_sha: lastCommitSha,
        created_at: Math.floor(Date.now() / 1000),
    }

    db.prepare(
        `INSERT INTO repos (id, url, status, size_bytes, last_commit_sha, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(repo.id, repo.url, repo.status, repo.size_bytes, repo.last_commit_sha, repo.created_at)

    return repo
}