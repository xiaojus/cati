/**
 * 创建/更新一个登录账号，并绑定到煤球。
 *
 * 用法：
 *   CAT_USER_EMAIL=a@x.com CAT_USER_PASSWORD='...' CAT_USER_NAME='小橘' npm run user:set
 *
 * 不把密码写进命令行历史；密码只从环境变量读。
 */
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { catMembers, cats, users } from '../lib/schema';

async function main() {
  const email = (process.env.CAT_USER_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.CAT_USER_PASSWORD ?? '';
  const displayName = process.env.CAT_USER_NAME ?? null;

  if (!email || !password) {
    console.error('缺少 CAT_USER_EMAIL 或 CAT_USER_PASSWORD');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('密码至少 8 位');
    process.exit(1);
  }

  const passwordHash = await hash(password, 12);
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let userId: string;
  if (existing.length > 0) {
    userId = existing[0].id;
    await db.update(users).set({ passwordHash, displayName }).where(eq(users.id, userId));
    console.log(`[user:set] 已更新 ${email}`);
  } else {
    userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash,
      displayName,
      createdAt: new Date().toISOString(),
    });
    console.log(`[user:set] 已创建 ${email}`);
  }

  const [cat] = await db.select().from(cats).limit(1);
  if (!cat) {
    console.log('[user:set] 还没有猫，跳过绑定');
    return;
  }

  const membership = await db
    .select()
    .from(catMembers)
    .where(eq(catMembers.userId, userId))
    .limit(1);
  if (membership.length === 0) {
    await db.insert(catMembers).values({ catId: cat.id, userId, role: 'owner' });
    console.log(`[user:set] 已绑定到 ${cat.name}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[user:set] 失败:', err);
    process.exit(1);
  });
