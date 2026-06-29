import { z } from "zod"

export const submitRepoRequestSchema = z.object({
  url: z.url(),
})

export const githubRepoResponseSchema = z.object({
  owner: z.object({ login: z.string() }),
  name: z.string(),
  size: z.number(),
  default_branch: z.string(),
  private: z.boolean(),
})

export type GithubRepoResponse = z.infer<typeof githubRepoResponseSchema> 

export type SubmitRepoRequest = z.infer<typeof submitRepoRequestSchema>