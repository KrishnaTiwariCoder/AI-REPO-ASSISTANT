import "dotenv/config";
import { runMigrations } from './db/migrate';

runMigrations();