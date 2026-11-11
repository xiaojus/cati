import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

const configuredPath = process.env.CAT_DB ?? './data/cat.db';

/** Absolute path used for the SQLite file (kept as-is for in-memory DBs). */
export const dbPath =
  configuredPath === ':memory:' ? configuredPath : resolve(configuredPath);

type GlobalWithDb = typeof globalThis & {
  __catiSqlite?: Database.Database;
};

const globalWithDb = globalThis as GlobalWithDb;

function createSqlite(): Database.Database {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const connection = new Database(dbPath);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');
  return connection;
}

/** Single better-sqlite3 connection shared across the process (and dev HMR). */
export const sqlite = globalWithDb.__catiSqlite ?? createSqlite();
globalWithDb.__catiSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
