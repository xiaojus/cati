import Database from 'better-sqlite3';
import { hashSync } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
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

const now = new Date();
const createdAt = now.toISOString();

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toDateString(date);
}

const userId = randomUUID();
const catId = randomUUID();

const seed = sqlite.transaction(() => {
  // Seed owns the demo dataset: clear it first so re-running is idempotent.
  sqlite.prepare('DELETE FROM ai_parses').run();
  sqlite.prepare('DELETE FROM daily_logs').run();
  sqlite.prepare('DELETE FROM records').run();
  sqlite.prepare('DELETE FROM cat_members').run();
  sqlite.prepare('DELETE FROM sessions').run();
  sqlite.prepare('DELETE FROM cats').run();
  sqlite.prepare('DELETE FROM users').run();

  sqlite
    .prepare(
      `INSERT INTO users (id, email, password_hash, display_name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      'me@local',
      hashSync('cati1234', 10),
      '煤球家长',
      createdAt,
    );

  sqlite
    .prepare(
      `INSERT INTO cats
         (id, name, birth_est, sex, neutered, neutered_at, avatar_url, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      catId,
      '煤球',
      '2025-09-01',
      'F',
      0,
      null,
      null,
      '捡来的小煤球',
      createdAt,
    );

  sqlite
    .prepare(
      `INSERT INTO cat_members (cat_id, user_id, role) VALUES (?, ?, ?)`,
    )
    .run(catId, userId, 'owner');

  const insertLog = sqlite.prepare(
    `INSERT INTO daily_logs
       (id, cat_id, log_date, appetite, water, stool_score, stool_count,
        vomit_count, energy, weight_g, note, photo_path, source, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (let i = 0; i < 14; i += 1) {
    insertLog.run(
      randomUUID(),
      catId,
      dayOffset(i - 13),
      3 + (i % 3),
      3 + ((i + 1) % 3),
      3 + (i % 4),
      1 + (i % 2),
      i === 6 ? 1 : 0,
      3 + ((i + 2) % 3),
      3100 + Math.round((150 * i) / 13),
      null,
      null,
      'manual',
      userId,
      createdAt,
    );
  }

  const insertRecord = sqlite.prepare(
    `INSERT INTO records
       (id, cat_id, type, name, event_date, dose, next_due, cost, vet,
        note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insertRecord.run(
    randomUUID(),
    catId,
    'vaccine',
    '猫三联疫苗',
    dayOffset(-90),
    '1 针',
    dayOffset(275),
    180,
    '安心宠物医院',
    null,
    userId,
    createdAt,
  );

  insertRecord.run(
    randomUUID(),
    catId,
    'deworm_in',
    '体内驱虫',
    dayOffset(-30),
    '1 片',
    dayOffset(60),
    60,
    '安心宠物医院',
    null,
    userId,
    createdAt,
  );

  insertRecord.run(
    randomUUID(),
    catId,
    'deworm_out',
    '体外驱虫',
    dayOffset(-30),
    '1 支',
    dayOffset(30),
    80,
    '安心宠物医院',
    null,
    userId,
    createdAt,
  );
});

seed();

const count = (table: string): number => {
  const row = sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as {
    c: number;
  };
  return row.c;
};

console.log(
  `[db:seed] ok -> ${dbPath} ` +
    `(users=${count('users')}, cats=${count('cats')}, ` +
    `daily_logs=${count('daily_logs')}, records=${count('records')})`,
);

sqlite.close();
