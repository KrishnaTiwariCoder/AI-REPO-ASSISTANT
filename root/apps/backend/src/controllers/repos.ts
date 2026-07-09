import { insertRepo } from "../repos/store"
import { insertJob } from "../jobs/store"
import type { SubmitRepoResponse } from "@ai-repo-assistant/shared/"
import { ZodSubmitRepoRequestSchema } from "@ai-repo-assistant/shared"
import { parseGithubUrl, fetchGithubRepoInfo, fetchLatestCommitSha, RepoNotFoundError } from "../utils/github"
import { runIndexingJob } from "../jobs/runner"


const MAX_REPO_SIZE_MB = Number(process.env.MAX_REPO_SIZE_MB ?? 200)


export const createRepoAndJob = async (c  :any) => {
    const rawBody = await c.req.json()
    const zodResult = ZodSubmitRepoRequestSchema.safeParse(rawBody) 
    if (!zodResult.success) {
        return c.json({ error: "Invalid request body", details: zodResult.error.flatten() }, 400)
    }

    let repoInfo, ownerAndName;
    
    try {
        ownerAndName = parseGithubUrl(zodResult.data.url)
        if (!ownerAndName) {
            return c.json({ error: "Invalid GitHub URL" }, 400)
        }
        repoInfo = await fetchGithubRepoInfo(ownerAndName.owner, ownerAndName.name)
    } catch (err) {
        if (err instanceof RepoNotFoundError) {
            return c.json({ error: "Repository not found" }, 404)
        }
        return c.json({ error: "Failed to reach GitHub API, try again shortly" }, 502)
    }

    if (repoInfo.private) {
        return c.json(
            { error: "Private repositories require GitHub OAuth, planned for v2" },
            403
        )
    }

    const sizeBytes = repoInfo.size * 1024
    if (sizeBytes > MAX_REPO_SIZE_MB * 1024 * 1024) {
        return c.json({ error: `Repository exceeds the ${MAX_REPO_SIZE_MB}MB size limit` }, 422)
    }

    let lastCommitSha: string
    try {
        lastCommitSha = await fetchLatestCommitSha(ownerAndName.owner, ownerAndName.name, repoInfo.default_branch)
    } catch {
        return c.json({ error: "Failed to read latest commit, try again shortly" }, 502)
    }

    const repo = insertRepo(zodResult.data.url, sizeBytes, lastCommitSha)
    const job = insertJob(repo.id);

    runIndexingJob(repo.id, job.id, zodResult.data.url).catch((err) => {
        console.error(`Unhandled error in indexing job ${job.id}:`, err)
    })

    const response: SubmitRepoResponse = { repoId: repo.id, jobId: job.id }
    return c.json(response, 201)
}