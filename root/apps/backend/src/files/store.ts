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
            const inserted: FileRecord[] = []

            for (const row of rows) {
                const file: FileRecord = {
                    id: randomUUID(),
                    repo_id: repoId,
                    path: row.path,
                    content: row.content,
                    hash: row.hash,
                }
                insert.run(file.id, file.repo_id, file.path, file.content, file.hash)
                inserted.push(file)
            }
            return inserted
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