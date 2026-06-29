import BetterSqlite3  from 'better-sqlite3';
import path from 'node:path';

const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'ai-repo-assistant.db');

export const db:BetterSqlite3 .Database = new BetterSqlite3(dbPath);
db.pragma('journal_mode = WAL'); 