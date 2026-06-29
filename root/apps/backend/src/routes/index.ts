import {Hono} from "hono"
import reposRouter from './repos'

const router = new Hono()

router.route('/repos', reposRouter)


export default router
