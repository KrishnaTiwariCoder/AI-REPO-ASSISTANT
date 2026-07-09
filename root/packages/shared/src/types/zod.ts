import { z } from "zod"

export const ZodSubmitRepoRequestSchema = z.object({
  url: z.url(),
})

export const ZodGithubRepoResponseSchema = z.object({
  owner: z.object({ login: z.string() }),
  name: z.string(),
  size: z.number(),
  default_branch: z.string(),
  private: z.boolean(),
})

export type ZodGithubRepoResponse = z.infer<typeof ZodGithubRepoResponseSchema> 

export type ZodSubmitRepoRequest = z.infer<typeof ZodSubmitRepoRequestSchema>