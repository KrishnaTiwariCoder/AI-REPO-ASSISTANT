import { Hono } from "hono"
import { createRepoAndJob,  } from "../controllers/repos"

export const reposRouter = new Hono()

reposRouter.post("/", createRepoAndJob)

export default reposRouter