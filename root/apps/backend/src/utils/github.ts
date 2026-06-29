import api from "./axios"
import { githubRepoResponseSchema , GithubRepoResponse } from "@ai-repo-assistant/shared"


export class RepoNotFoundError extends Error {}

const GITHUB_URL_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/

export function parseGithubUrl(url: string): { owner: string; name: string } | null {
  const match = GITHUB_URL_RE.exec(url.trim())
  if (!match) return null
  return { owner: match[1]!, name: match[2]! }
}

export async function fetchGithubRepoInfo(owner: string, name: string): Promise<GithubRepoResponse> {
  try {
    const res = await api.get(`/repos/${owner}/${name}`)
    const data = githubRepoResponseSchema.parse(res.data)

    return {
      owner: { login: data.owner.login },
      name: data.name,
      size: data.size,
      default_branch: data.default_branch,
      private: data.private,
    } as GithubRepoResponse
  } catch (err) {
    if ((err as Error & { status?: number }).status === 404) {
      throw new RepoNotFoundError(`Repo ${owner}/${name} not found or private`)
    }
    throw err
  }
}

export async function fetchLatestCommitSha(owner: string, name: string, branch: string): Promise<string> {
  const res = await api.get(`/repos/${owner}/${name}/commits/${branch}`)
  return res.data.sha
}