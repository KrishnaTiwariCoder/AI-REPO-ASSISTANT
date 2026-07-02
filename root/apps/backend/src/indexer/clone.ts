import { execa } from "execa"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

export interface CloneResult {
    tmpDir: string
}

export async function cloneRepo(url: string): Promise<CloneResult> {

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "ai-repo-assistant-"))

    try {
        await execa("git", ["clone", "--depth", "1", "--", url, tmpDir])
        return { tmpDir }
    } catch (err) {
        await cleanupClone(tmpDir)
        throw err
    }
}

export async function cleanupClone(tmpDir: string): Promise<void> {
    await rm(tmpDir, { recursive: true, force: true })
}