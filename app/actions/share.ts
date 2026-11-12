'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { catMembers, shareLinks } from '@/lib/schema';

/** base62：0-9 A-Z a-z，共 62 个字符。 */
const TOKEN_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TOKEN_LENGTH = 32;
const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9]{32}$/;

export type ShareLinkSummary = {
  token: string;
  expiresAt: string;
  createdAt: string;
};

export type CreateShareLinkResult =
  | { ok: true; token: string; expiresAt: string; createdAt: string }
  | { ok: false; error: string };

export type RevokeShareLinkResult = { ok: true } | { ok: false; error: string };

/** 用加密随机数逐位生成 base62 token，避免自增或可预测的 token。 */
function generateToken(): string {
  let token = '';

  for (let index = 0; index < TOKEN_LENGTH; index += 1) {
    token += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }

  return token;
}

async function isMember(userId: string, catId: string): Promise<boolean> {
  const [membership] = await db
    .select({ catId: catMembers.catId })
    .from(catMembers)
    .where(
      and(eq(catMembers.catId, catId), eq(catMembers.userId, userId)),
    )
    .limit(1);

  return Boolean(membership);
}

/**
 * 为当前猫生成一条 7 天有效的只读分享链接。
 * catId 来自页面上的当前猫，但服务端仍会重新校验 membership。
 */
export async function createShareLink(
  catId: string,
): Promise<CreateShareLinkResult> {
  const parsedCatId = z.uuid({ error: '猫咪编号不正确' }).safeParse(catId);
  if (!parsedCatId.success) {
    return { ok: false, error: '猫咪编号不正确' };
  }

  const user = await requireUser();

  if (!(await isMember(user.id, parsedCatId.data))) {
    return { ok: false, error: '你不在这个猫咪的家庭里，不能生成分享链接' };
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SHARE_TTL_MS);

  // token 是 32 位随机串，撞库概率可以忽略；仍然保留有限次重试。
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const token = generateToken();

      await db.insert(shareLinks).values({
        token,
        catId: parsedCatId.data,
        createdBy: user.id,
        expiresAt: expiresAt.toISOString(),
        createdAt: createdAt.toISOString(),
      });

      revalidatePath('/records');
      revalidatePath('/profile');

      return {
        ok: true,
        token,
        expiresAt: expiresAt.toISOString(),
        createdAt: createdAt.toISOString(),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed: share_links.token')
      ) {
        continue;
      }

      console.error('[createShareLink] 生成分享链接失败', error);
      return { ok: false, error: '生成分享链接失败，请稍后再试' };
    }
  }

  return { ok: false, error: '生成分享链接失败，请稍后再试' };
}

/** 作废一条分享链接；服务端重新校验当前用户是否属于该猫。 */
export async function revokeShareLink(
  token: string,
): Promise<RevokeShareLinkResult> {
  if (!TOKEN_PATTERN.test(token)) {
    return { ok: false, error: '分享链接不正确' };
  }

  const user = await requireUser();

  const [link] = await db
    .select({ token: shareLinks.token, catId: shareLinks.catId })
    .from(shareLinks)
    .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)))
    .limit(1);

  if (!link) {
    return { ok: false, error: '分享链接不存在或已经作废' };
  }

  if (!(await isMember(user.id, link.catId))) {
    return { ok: false, error: '你不在这个猫咪的家庭里，不能作废分享链接' };
  }

  await db
    .update(shareLinks)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)));

  revalidatePath('/records');
  revalidatePath('/profile');

  return { ok: true };
}
