/**
 * 创建/更新一个登录账号，并绑定到煤球。
 *
 * 用法：
 *   CAT_USER_EMAIL=a@x.com CAT_USER_PASSWORD='...' CAT_USER_NAME='小橘' npm run user:set
 *   # 只改密码：同样的命令再跑一次，会覆盖该邮箱的密码
 *
 * 不把密码写进命令行历史；密码只从环境变量读。
 *
 * 注意：只 import npm 包，不 import 项目内的 .ts 文件——Node 直接跑 TS 时
 * 按 ESM 解析，省略扩展名的相对路径会报 ERR_MODULE_NOT_FOUND。
 */
import Database from 'better-sqlite3';
import { hashSync } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const configuredPath = process.env.CAT_DB ?? './data/cat.db';
const dbPath = configuredPath === ':memory:' ? configuredPath : resolve(configuredPath);
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });

const email = (process.env.CAT_USER_EMAIL ?? '').trim().toLowerCase();
const password = process.env.CAT_USER_PASSWORD ?? '';
const displayName = process.env.CAT_USER_NAME ?? null;
const catName = process.env.CAT_NAME ?? '煤球';

if (!email || !password) {
  console.error('[user:set] 缺少 CAT_USER_EMAIL 或 CAT_USER_PASSWORD');
  process.exit(1);
}
if (password.length < 8) {
  console.error('[user:set] 密码至少 8 位');
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const passwordHash = hashSync(password, 12);
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as
  | { id: string }
  | undefined;

let userId: string;
if (existing) {
  userId = existing.id;
  db.prepare('UPDATE users SET password_hash = ?, display_name = ? WHERE id = ?').run(
    passwordHash,
    displayName,
    userId,
  );
  console.log(`[user:set] 已更新 ${email}`);
} else {
  userId = randomUUID();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(userId, email, passwordHash, displayName, new Date().toISOString());
  console.log(`[user:set] 已创建 ${email}`);
}

const cat = db.prepare('SELECT id, name FROM cats ORDER BY created_at LIMIT 1').get() as
  | { id: string; name: string }
  | undefined;

if (!cat) {
  console.log('[user:set] 还没有猫，跳过绑定');
} else {
  const membership = db
    .prepare('SELECT cat_id FROM cat_members WHERE user_id = ? AND cat_id = ?')
    .get(userId, cat.id) as { cat_id: string } | undefined;
  if (!membership) {
    db.prepare('INSERT INTO cat_members (cat_id, user_id, role) VALUES (?, ?, ?)').run(
      cat.id,
      userId,
      'owner',
    );
    console.log(`[user:set] 已绑定到 ${cat.name}`);
  } else {
    console.log(`[user:set] 已在 ${cat.name} 的成员里`);
  }
  if (cat.name !== catName) {
    console.log(`[user:set] 提示：绑定的是「${cat.name}」，不是「${catName}」`);
  }
}

db.close();
