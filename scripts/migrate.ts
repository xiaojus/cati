import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const configuredPath = process.env.CAT_DB ?? './data/cat.db';
const dbPath =
  configuredPath === ':memory:' ? configuredPath : resolve(configuredPath);

if (dbPath !== ':memory:') {
  mkdirSync(dirname(dbPath), { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

try {
  migrate(drizzle(sqlite), {
    migrationsFolder: resolve('drizzle'),
  });
  console.log(`[db:migrate] schema up to date -> ${dbPath}`);
} finally {
  sqlite.close();
}
