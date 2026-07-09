import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import { insertFiles } from "../files/store"
import { updateJob } from "../jobs/store"

import { ALLOWED_EXTENSIONS, SKIP_DIRS } from "@ai-repo-assistant/shared"

async function collectSourceFiles(dir: string, files: string[] = []): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) await collectSourceFiles(fullPath, files)
        } else if (entry.isFile()) {
            if (ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                files.push(fullPath)
            }
        }
    }
    return files
}

function hashContent(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex")
}

export interface ReadFilesResult {
    fileCount: number
}

export async function readAndHashFiles(
    tmpDir: string,
    repoId: string,
    jobId: string
): Promise<ReadFilesResult> {
    const batch: Array<{ path: string; content: string; hash: string }> = []
    const sourceFiles = await collectSourceFiles(tmpDir)
    const total = sourceFiles.length
    let i = 0;
    for (const filePath of sourceFiles) {
        i++;
        const absPath = filePath
        const relativePath = path.relative(tmpDir, absPath)

        let content: string
        try {
            content = await readFile(absPath, "utf-8")
        } catch (err) {
            console.warn(`Skipping unreadable file: ${relativePath}`, err)
            continue
        }

        const hash = hashContent(content)
        batch.push({ path: relativePath, content, hash })

        if (i % 10 === 0 || i === total - 1) {
            const pct = Math.round(10 + ((i + 1) / total) * 20)
            updateJob(jobId, { progress_pct: pct })
        }
    }

    insertFiles(repoId, batch)

    return { fileCount: batch.length }
}