'use server';

import { and, asc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { catMembers, invites } from '@/lib/schema';

/** 去掉了 0/O、1/I 等易混字符，方便口头或手抄。 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export type CreateInviteResult =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; error: string };

export type RevokeInviteResult = { ok: true } | { ok: false; error: string };

export type RedeemInviteResult =
  | { ok: true; catId: string }
  | { ok: false; code: 'invalid' | 'used' | 'expired' | 'error'; error: string };

export type RemoveMemberResult = { ok: true } | { ok: false; error: string };

const codeSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z
    .string({ error: '邀请码不对' })
    .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/, '邀请码不对'),
);

const userIdSchema = z.uuid({ error: '成员不存在' });

function generateCode(): string {
  let code = '';

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }

  return code;
}

function readCode(input: FormData | Record<string, unknown> | string): unknown {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof FormData) {
    return input.get('code');
  }

  return input.code;
}

/** 取当前用户的第一个 owner 身份，T12 阶段每人只有一只猫。 */
async function findOwnedCatId(userId: string): Promise<string | null> {
  const [membership] = await db
    .select({ catId: catMembers.catId })
    .from(catMembers)
    .where(and(eq(catMembers.userId, userId), eq(catMembers.role, 'owner')))
    .orderBy(asc(catMembers.catId))
    .limit(1);

  return membership?.catId ?? null;
}

/**
 * 为当前用户作为 owner 的猫生成一次性邀请码，24 小时有效。
 * 邀请码用加密随机数生成，不可预测。
 */
export async function createInvite(): Promise<CreateInviteResult> {
  const user = await requireUser();
  const catId = await findOwnedCatId(user.id);

  if (!catId) {
    return { ok: false, error: '只有创建者可以邀请家人' };
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + INVITE_TTL_MS);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const code = generateCode();

      await db.insert(invites).values({
        code,
        catId,
        createdBy: user.id,
        role: 'member',
        expiresAt: expiresAt.toISOString(),
        createdAt: createdAt.toISOString(),
      });

      revalidatePath('/profile');
      return { ok: true, code, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      // 极小概率撞码：换一个再试；其他错误直接返回。
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed: invites.code')
      ) {
        continue;
      }

      console.error('[createInvite] 生成邀请码失败', error);
      return { ok: false, error: '生成邀请码失败，请稍后再试' };
    }
  }

  return { ok: false, error: '生成邀请码失败，请稍后再试' };
}

/** 作废（删除）自己 cat 下的一张未使用邀请码。 */
export async function revokeInvite(
  input: FormData | Record<string, unknown> | string,
): Promise<RevokeInviteResult> {
  const parsed = codeSchema.safeParse(readCode(input));
  if (!parsed.success) {
    return { ok: false, error: '邀请码不对' };
  }

  const user = await requireUser();

  const [invite] = await db
    .select({ code: invites.code, catId: invites.catId, usedBy: invites.usedBy })
    .from(invites)
    .where(eq(invites.code, parsed.data))
    .limit(1);

  if (!invite) {
    return { ok: false, error: '邀请码不对' };
  }

  if (invite.usedBy) {
    return { ok: false, error: '这个邀请码已经被用过了' };
  }

  const [owner] = await db
    .select({ catId: catMembers.catId })
    .from(catMembers)
    .where(
      and(
        eq(catMembers.catId, invite.catId),
        eq(catMembers.userId, user.id),
        eq(catMembers.role, 'owner'),
      ),
    )
    .limit(1);

  if (!owner) {
    return { ok: false, error: '只有创建者可以作废邀请码' };
  }

  await db.delete(invites).where(eq(invites.code, invite.code));

  revalidatePath('/profile');
  return { ok: true };
}

/**
 * 用邀请码加入一个已有家庭。
 * 校验存在 / 未使用 / 未过期，然后在同一事务里占码并写入成员关系。
 */
export async function redeemInvite(
  input: FormData | Record<string, unknown> | string,
): Promise<RedeemInviteResult> {
  const parsed = codeSchema.safeParse(readCode(input));
  if (!parsed.success) {
    return { ok: false, code: 'invalid', error: '邀请码不对' };
  }

  const user = await requireUser();

  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.code, parsed.data))
    .limit(1);

  if (!invite) {
    return { ok: false, code: 'invalid', error: '邀请码不对' };
  }

  if (invite.usedBy) {
    return { ok: false, code: 'used', error: '这个邀请码已经被用过了' };
  }

  const now = new Date();
  if (invite.expiresAt <= now.toISOString()) {
    return {
      ok: false,
      code: 'expired',
      error: '邀请码过期了，让对方重新生成',
    };
  }

  try {
    db.transaction((tx) => {
      const claimed = tx
        .update(invites)
        .set({ usedBy: user.id, usedAt: now.toISOString() })
        .where(and(eq(invites.code, invite.code), isNull(invites.usedBy)))
        .run();

      if (claimed.changes === 0) {
        throw new InviteAlreadyUsedError();
      }

      tx.insert(catMembers)
        .values({ catId: invite.catId, userId: user.id, role: 'member' })
        .onConflictDoNothing()
        .run();
    });
  } catch (error) {
    if (error instanceof InviteAlreadyUsedError) {
      return { ok: false, code: 'used', error: '这个邀请码已经被用过了' };
    }

    console.error('[redeemInvite] 加入失败', error);
    return { ok: false, code: 'error', error: '加入失败，请稍后再试' };
  }

  revalidatePath('/welcome');
  revalidatePath('/today');
  revalidatePath('/profile');

  return { ok: true, catId: invite.catId };
}

/** owner 移除家人；不能移除自己，也不能移除猫的最后一个 owner。 */
export async function removeMember(
  input: FormData | Record<string, unknown> | string,
): Promise<RemoveMemberResult> {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof FormData
        ? input.get('userId')
        : input.userId;
  const parsed = userIdSchema.safeParse(raw);

  if (!parsed.success) {
    return { ok: false, error: '成员不存在' };
  }

  const user = await requireUser();
  if (parsed.data === user.id) {
    return { ok: false, error: '不能移除自己' };
  }

  const ownedCats = await db
    .select({ catId: catMembers.catId })
    .from(catMembers)
    .where(and(eq(catMembers.userId, user.id), eq(catMembers.role, 'owner')))
    .orderBy(asc(catMembers.catId));

  if (ownedCats.length === 0) {
    return { ok: false, error: '只有创建者可以移除成员' };
  }

  for (const { catId } of ownedCats) {
    const [target] = await db
      .select({ role: catMembers.role })
      .from(catMembers)
      .where(
        and(eq(catMembers.catId, catId), eq(catMembers.userId, parsed.data)),
      )
      .limit(1);

    if (!target) {
      continue;
    }

    if (target.role === 'owner') {
      const owners = await db
        .select({ userId: catMembers.userId })
        .from(catMembers)
        .where(
          and(eq(catMembers.catId, catId), eq(catMembers.role, 'owner')),
        );

      if (owners.length <= 1) {
        return { ok: false, error: '不能移除最后一个创建者' };
      }
    }

    await db
      .delete(catMembers)
      .where(
        and(eq(catMembers.catId, catId), eq(catMembers.userId, parsed.data)),
      );

    revalidatePath('/profile');
    return { ok: true };
  }

  return { ok: false, error: '成员不存在' };
}

class InviteAlreadyUsedError extends Error {
  constructor() {
    super('invite already used');
    this.name = 'InviteAlreadyUsedError';
  }
}
