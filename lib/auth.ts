/**
 * 仅服务端使用。
 * 这里依赖 better-sqlite3 与 bcryptjs，客户端组件不要 import 本文件。
 */
import { compare } from 'bcryptjs';
import { and, eq, gt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { sessions, users } from './schema';

export const SESSION_COOKIE_NAME = 'cati_sid';

/** Session 有效期：7 天。 */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
};

/**
 * 校验邮箱 + 密码。成功返回精简后的用户信息，失败返回 null。
 * 不区分「邮箱不存在」与「密码错误」，避免账号枚举。
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return null;
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    return null;
  }

  const passwordMatches = await compare(password, user.passwordHash);
  if (!passwordMatches) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

/**
 * 创建一条 7 天后过期的 session，并写入 httpOnly cookie。
 * 只能在 Route Handler / Server Function 中调用。
 */
export async function createSession(userId: string): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const sessionId = randomUUID();

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * 读取 cookie → 查 sessions 表 → 返回未过期 session 对应的用户。
 * 未登录、session 不存在或已过期都返回 null。
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  // cacheComponents：显式进入请求时渲染，允许读取当前时间判断过期。
  await connection();

  const sessionId = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return null;
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  return user ?? null;
}

/** 页面级守卫：未登录直接跳转 /login。 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }

  return user;
}
