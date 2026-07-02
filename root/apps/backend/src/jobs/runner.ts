import { cloneRepo, cleanupClone } from "../indexer/clone"
import { setJobCloning, setJobFailed, setJobDone } from "./store"

export async function runIndexingJob(
    repoId: string,
    jobId: string,
    repoUrl: string
): Promise<void> {
    const startedAt = Date.now();
    let tmpDir: string | null = null;

    try {
        setJobCloning(jobId);
        const result = await cloneRepo(repoUrl);
        tmpDir = result.tmpDir;
        // here the jobs about parsing and indexing the repo would happen, but for this example, we just simulate a delay
        await cleanupClone(tmpDir);
        tmpDir = null;
        // Mark the job as done with some dummy stats, later will be replaced with actual stats from the indexing process
        setJobDone(jobId, {
            files_parsed: 0,
            symbol_count: 0,
            edge_count: 0,
            duration_ms: Date.now() - startedAt,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setJobFailed(jobId, message)
    } finally {
        if (tmpDir) {
            await cleanupClone(tmpDir).catch((cleanupErr) => {
                console.error(`Failed to clean up temp dir ${tmpDir}:`, cleanupErr)
            })
        }
    }
}