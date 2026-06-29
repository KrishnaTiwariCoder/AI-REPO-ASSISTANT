import "dotenv/config";
import { Hono } from 'hono' 
import { serve } from '@hono/node-server'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

import { runMigrations } from './db/migrate';
runMigrations();

import router from './routes';


const app = new Hono().basePath('/api/v1')

app.use(logger())
app.use(cors())

app.route('/', router)

const port = Number(process.env.PORT ?? 4000)
serve({ fetch: app.fetch, port })
console.log(`Backend running on http://localhost:${port}`)