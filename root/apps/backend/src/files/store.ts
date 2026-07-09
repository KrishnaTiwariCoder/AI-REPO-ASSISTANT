import { randomUUID } from "node:crypto"
import { db } from "../db/connection"
import type { FileRecord } from "@ai-repo-assistant/shared/"

export function insertFile(
    repoId: string,
    path: string,
    content: string,
    hash: string
): FileRecord {
    const file: FileRecord = {
        id: randomUUID(),
        repo_id: repoId,
        path,
        content,
        hash,
    }

    db.prepare(
        `INSERT INTO files (id, repo_id, path, content, hash)
         VALUES (?, ?, ?, ?, ?)`
    ).run(file.id, file.repo_id, file.path, file.content, file.hash)

    return file
}

export function insertFiles(
    repoId: string,
    files: Array<{ path: string; content: string; hash: string }>
): void {
    const insert = db.prepare(
        `INSERT INTO files (id, repo_id, path, content, hash)
         VALUES (?, ?, ?, ?, ?)`
    )

    const insertAll = db.transaction(
        (rows: Array<{ path: string; content: string; hash: string }>) => {
            for (const row of rows) {
                insert.run(randomUUID(), repoId, row.path, row.content, row.hash)
            }
        }
    )

    insertAll(files)
}

export function getFilesByRepo(repoId: string): FileRecord[] {
    return db
        .prepare(`SELECT * FROM files WHERE repo_id = ?`)
        .all(repoId) as FileRecord[]
}

export function getFileById(fileId: string): FileRecord | null {
    return (
        (db
            .prepare(`SELECT * FROM files WHERE id = ?`)
            .get(fileId) as FileRecord) ?? null
    )
}