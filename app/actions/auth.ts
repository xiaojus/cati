'use server';

import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';

export type RegisterResult = { ok: false; error: string };

const registerSchema = z.object({
  email: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.email({ error: '邮箱格式不对' }),
  ),
  password: z
    .string({ error: '密码至少 8 位' })
    .min(8, '密码至少 8 位'),
  displayName: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z
      .string({ error: '给你的昵称起个名字吧' })
      .min(1, '给你的昵称起个名字吧')
      .max(12, '昵称最多 12 个字'),
  ),
});

/**
 * 注册新用户：校验 → 邮箱查重 → 写入 users → 建立 session → 去欢迎页。
 * 校验失败返回中文错误，不抛异常；成功时由 redirect 直接跳转。
 */
export async function register(input: unknown): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? '注册信息有误，请检查后重试',
    };
  }

  const { email, password, displayName } = parsed.data;

  try {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return { ok: false, error: '这个邮箱已经注册过了' };
    }

    const userId = randomUUID();
    const passwordHash = await hash(password, 12);

    await db.insert(users).values({
      id: userId,
      email,
      passwordHash,
      displayName,
      createdAt: new Date().toISOString(),
    });

    await createSession(userId);
  } catch (error) {
    // 两个请求同时注册同一邮箱时，唯一索引会兜底；对用户仍显示同一句提示。
    if (
      error instanceof Error &&
      error.message.includes('UNIQUE constraint failed: users.email')
    ) {
      return { ok: false, error: '这个邮箱已经注册过了' };
    }

    console.error('[register] 注册失败', error);
    return { ok: false, error: '注册失败，请稍后再试' };
  }

  redirect('/welcome');
}
