import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"

vi.mock("../files/store", () => ({
    insertFiles: vi.fn(),
}))
vi.mock("../jobs/store", () => ({
    updateJob: vi.fn(),
}))

import { readAndHashFiles } from "./reader"
import { insertFiles } from "../files/store"
import { updateJob } from "../jobs/store"

async function createFakeRepo(): Promise<string> {
    const tmpDir = await mkdtemp(join(tmpdir(), "ai-repo-assistant-reader-test-"))
    return tmpDir
}

function sha256(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex")
}

describe("readAndHashFiles", () => {
    let tmpDir: string

    beforeEach(async () => {
        tmpDir = await createFakeRepo()
        vi.clearAllMocks()
    })

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true })
    })

    it("reads .ts and .tsx files and stores their content + hash", async () => {
        await writeFile(join(tmpDir, "index.ts"), "export const a = 1")
        await writeFile(join(tmpDir, "App.tsx"), "export default () => null")

        const result = await readAndHashFiles(tmpDir, "repo-1", "job-1")

        expect(result.fileCount).toBe(2)
        expect(vi.mocked(insertFiles)).toHaveBeenCalledOnce()

        const [, batch] = vi.mocked(insertFiles).mock.calls[0]!
        const paths = batch.map((f) => f.path)

        expect(paths).toContain("index.ts")
        expect(paths).toContain("App.tsx")
    })

    it("stores the correct hash for each file", async () => {
        const content = "export const x = 42"
        await writeFile(join(tmpDir, "foo.ts"), content)

        await readAndHashFiles(tmpDir, "repo-1", "job-1")

        const [, batch] = vi.mocked(insertFiles).mock.calls[0]!
        const file = batch.find((f) => f.path === "foo.ts")

        expect(file?.hash).toBe(sha256(content))
        expect(file?.content).toBe(content)
    })

    it("skips non-source extensions", async () => {
        await writeFile(join(tmpDir, "styles.css"), "body { margin: 0 }")
        await writeFile(join(tmpDir, "README.md"), "# hello")
        await writeFile(join(tmpDir, "data.json"), "{}")
        await writeFile(join(tmpDir, "valid.ts"), "const x = 1")

        const result = await readAndHashFiles(tmpDir, "repo-1", "job-1")

        expect(result.fileCount).toBe(1)
        const [, batch] = vi.mocked(insertFiles).mock.calls[0]!
        expect(batch[0]?.path).toBe("valid.ts")
    })

    it("skips node_modules directory", async () => {
        await mkdir(join(tmpDir, "node_modules", "some-pkg"), { recursive: true })
        await writeFile(join(tmpDir, "node_modules", "some-pkg", "index.ts"), "// pkg")
        await writeFile(join(tmpDir, "src.ts"), "const x = 1")

        const result = await readAndHashFiles(tmpDir, "repo-1", "job-1")

        expect(result.fileCount).toBe(1)
        const [, batch] = vi.mocked(insertFiles).mock.calls[0]!
        expect(batch[0]?.path).toBe("src.ts")
    })

    it("skips .git directory", async () => {
        await mkdir(join(tmpDir, ".git"), { recursive: true })
        await writeFile(join(tmpDir, ".git", "config"), "")
        await writeFile(join(tmpDir, "real.ts"), "const y = 2")

        const result = await readAndHashFiles(tmpDir, "repo-1", "job-1")

        expect(result.fileCount).toBe(1)
    })

    it("skips dist and .next directories", async () => {
        await mkdir(join(tmpDir, "dist"), { recursive: true })
        await mkdir(join(tmpDir, ".next"), { recursive: true })
        await writeFile(join(tmpDir, "dist", "bundle.js"), "compiled")
        await writeFile(join(tmpDir, ".next", "server.js"), "compiled")
        await writeFile(join(tmpDir, "index.ts"), "source")

        const result = await readAndHashFiles(tmpDir, "repo-1", "job-1")

        expect(result.fileCount).toBe(1)
    })

    it("stores relative paths, not absolute paths", async () => {
        await mkdir(join(tmpDir, "src"), { recursive: true })
        await writeFile(join(tmpDir, "src", "utils.ts"), "export const u = 1")

        await readAndHashFiles(tmpDir, "repo-1", "job-1")

        const [, batch] = vi.mocked(insertFiles).mock.calls[0]!
        expect(batch[0]?.path).toBe(join("src", "utils.ts"))
    })

    it("calls updateJob for progress during reading", async () => {
        await writeFile(join(tmpDir, "a.ts"), "const a = 1")
        await writeFile(join(tmpDir, "b.ts"), "const b = 2")

        await readAndHashFiles(tmpDir, "repo-1", "job-1")

        expect(vi.mocked(updateJob)).toHaveBeenCalled()
    })

    it("returns fileCount of 0 for an empty repo", async () => {
        const result = await readAndHashFiles(tmpDir, "repo-1", "job-1")

        expect(result.fileCount).toBe(0)
        expect(vi.mocked(insertFiles)).toHaveBeenCalledWith("repo-1", [])
    })
})