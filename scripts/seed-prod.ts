/**
 * 生产库初始化：只建一只猫，不写任何假记录。
 *
 * 用法：CAT_DB=./data/cat.db node scripts/seed-prod.ts
 * 幂等：已存在同名猫就跳过，不会重复插入。
 *
 * 注意：只 import npm 包，不 import 项目内的 .ts 文件——Node 直接跑 TS 时
 * 按 ESM 解析，省略扩展名的相对路径会报 ERR_MODULE_NOT_FOUND。
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const configuredPath = process.env.CAT_DB ?? './data/cat.db';
const dbPath = configuredPath === ':memory:' ? configuredPath : resolve(configuredPath);
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });

const CAT_NAME = process.env.CAT_NAME ?? '煤球';
const CAT_BIRTH = process.env.CAT_BIRTH ?? '2025-09-01';
const CAT_SEX = process.env.CAT_SEX ?? 'F';
const CAT_NOTE = process.env.CAT_NOTE ?? '2026-11-10 从小区抓回，隔离期至 2026-11-25';

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const existing = db.prepare('SELECT id FROM cats WHERE name = ?').get(CAT_NAME) as
  | { id: string }
  | undefined;

if (existing) {
  console.log(`[seed-prod] ${CAT_NAME} 已存在，跳过`);
} else {
  db.prepare(
    `INSERT INTO cats (id, name, birth_est, sex, neutered, neutered_at, avatar_url, note, created_at)
     VALUES (?, ?, ?, ?, 0, NULL, NULL, ?, ?)`,
  ).run(randomUUID(), CAT_NAME, CAT_BIRTH, CAT_SEX, CAT_NOTE, new Date().toISOString());
  console.log(`[seed-prod] 已创建 ${CAT_NAME}（无历史记录）`);
}

db.close();
