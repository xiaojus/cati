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

  // 构建期 next build 会用多个 worker 同时求值模块，几路一起打开同一个库时
  // 切 WAL 需要写锁，拿不到会抛 SQLITE_BUSY 并让整个构建失败。
  // 先给一个等待窗口；仍然失败就退回默认日志模式，不影响运行时正确性。
  connection.pragma('busy_timeout = 5000');

  try {
    connection.pragma('journal_mode = WAL');
  } catch (error) {
    console.warn('[db] 切换 WAL 失败，继续用默认日志模式：', (error as Error).message);
  }

  connection.pragma('foreign_keys = ON');
  return connection;
}

/** Single better-sqlite3 connection shared across the process (and dev HMR). */
export const sqlite = globalWithDb.__catiSqlite ?? createSqlite();
globalWithDb.__catiSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
