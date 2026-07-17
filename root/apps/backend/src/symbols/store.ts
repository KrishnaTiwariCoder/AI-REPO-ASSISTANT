// symbols/store.ts
import { randomUUID } from "node:crypto"
import { db } from "../db/connection"
import type { CodeSymbol } from "@ai-repo-assistant/shared"


export type SymbolInput = Pick<CodeSymbol, "name" | "kind" | "line_start" | "line_end" | "signature" | "docstring">

export function insertSymbols(fileId: string, symbols: SymbolInput[]): CodeSymbol[] {
    const insert = db.prepare(
        `INSERT INTO symbols (id, file_id, name, kind, line_start, line_end, signature, docstring)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const insertAll = db.transaction((rows: SymbolInput[]): CodeSymbol[] => {
        const inserted: CodeSymbol[] = []
        for (const row of rows) {
            const symbol: CodeSymbol = {
                id: randomUUID(),
                file_id: fileId,
                name: row.name,
                kind: row.kind,
                line_start: row.line_start,
                line_end: row.line_end,
                signature: row.signature,
                docstring: row.docstring,
            }
            insert.run(
                symbol.id,
                symbol.file_id,
                symbol.name,
                symbol.kind,
                symbol.line_start,
                symbol.line_end,
                symbol.signature,
                symbol.docstring
            )
            inserted.push(symbol)
        }
        return inserted
    })

    return insertAll(symbols)
}

export function getSymbolsByFile(fileId: string): CodeSymbol[] {
    return db
        .prepare(`SELECT * FROM symbols WHERE file_id = ?`)
        .all(fileId) as CodeSymbol[]
}

export function getSymbolsByRepo(repoId: string): CodeSymbol[] {
    return db
        .prepare(
            `SELECT s.* FROM symbols s
             JOIN files f ON f.id = s.file_id
             WHERE f.repo_id = ?`
        )
        .all(repoId) as CodeSymbol[]
}

export function findSymbolsByName(repoId: string, name: string): CodeSymbol[] {
    return db
        .prepare(
            `SELECT s.* FROM symbols s
             JOIN files f ON f.id = s.file_id
             WHERE f.repo_id = ? AND s.name = ?`
        )
        .all(repoId, name) as CodeSymbol[]
}