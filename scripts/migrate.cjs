// 容器启动时跑迁移（纯 CJS，不依赖 TS 运行时 / drizzle-kit）
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { migrate } = require('drizzle-orm/better-sqlite3/migrator');

const dbPath = process.env.CAT_DB || path.join(process.cwd(), 'data', 'cat.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

try {
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  console.log('[migrate] ok ->', dbPath);
} catch (err) {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
} finally {
  sqlite.close();
}
