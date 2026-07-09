import { cloneRepo, cleanupClone } from "../indexer/clone"
import { readAndHashFiles } from "../indexer/reader";
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
        
        const files : { fileCount: number } = await readAndHashFiles(tmpDir, repoId, jobId);
        
        await cleanupClone(tmpDir);
        tmpDir = null;
        setJobDone(jobId, {
            files_parsed: files.fileCount,
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