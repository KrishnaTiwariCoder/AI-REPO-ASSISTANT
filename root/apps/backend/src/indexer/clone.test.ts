import { describe, it, expect, vi, beforeEach } from "vitest"
import { existsSync } from "node:fs"
import { cloneRepo, cleanupClone } from "./clone"

vi.mock("execa", () => ({
    execa: vi.fn().mockResolvedValue({}),
}))

describe("cloneRepo", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("creates a temp directory and returns its path", async () => {
        const { tmpDir } = await cloneRepo("https://github.com/KrishnaTiwariCoder/ai-repo-assistant")

        expect(existsSync(tmpDir)).toBe(true)

        await cleanupClone(tmpDir)
    })

    it("calls git clone with --depth 1 and the correct url", async () => {
        const { execa } = await import("execa")
        const url = "https://github.com/KrishnaTiwariCoder/ai-repo-assistant"

        const { tmpDir } = await cloneRepo(url)

        expect(execa).toHaveBeenCalledWith(
            "git",
            expect.arrayContaining(["clone", "--depth", "1", "--", url])
        )

        await cleanupClone(tmpDir)
    })

    it("cleans up the temp directory if clone fails", async () => {
        const { execa } = await import("execa")

        vi.mocked(execa).mockRejectedValueOnce(
            new Error("repository not found")
        )

        await expect(cloneRepo("https://github.com/KrishnaTiwariCoder/ai-repo-assistant")).rejects.toThrow(
            "repository not found"
        )
        const { readdirSync } = await import("node:fs")
        const { tmpdir } = await import("node:os")
        const leftover = readdirSync(tmpdir()).filter((d) =>
            d.startsWith("reposage-")
        )

        expect(leftover).toHaveLength(0)
    })
})

describe("cleanupClone", () => {
    it("removes an existing directory", async () => {
        const { mkdtemp, writeFile } = await import("node:fs/promises")
        const { join } = await import("node:path")
        const { tmpdir } = await import("node:os")

        const tmpDir = await mkdtemp(join(tmpdir(), "reposage-test-"))

        await writeFile(join(tmpDir, "dummy.txt"), "test")

        expect(existsSync(tmpDir)).toBe(true)

        await cleanupClone(tmpDir)

        expect(existsSync(tmpDir)).toBe(false)
    })

    it("does not throw if the directory does not exist", async () => {
        await expect(
            cleanupClone("/tmp/reposage-does-not-exist-xyz")
        ).resolves.not.toThrow()
    })
})