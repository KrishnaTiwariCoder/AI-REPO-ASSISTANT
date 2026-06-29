import { db } from './connection';
import fs from 'node:fs';
import path from 'node:path';

function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
}

export function runMigrations() {
  ensureMigrationsTable();

  const dir = path.join(process.cwd(), 'src', 'db', 'migrations');

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  const applied = new Set(
    db.prepare('SELECT filename FROM _migrations').all().map((r: any) => r.filename)
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
    console.log(`Applied migration: ${file}`);
  }
}