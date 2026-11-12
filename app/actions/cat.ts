'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { saveIsolationStart } from '@/lib/app-settings';
import { requireUser } from '@/lib/auth';
import {
  requireCurrentCat,
  writeCurrentCatCookie,
} from '@/lib/current-cat';
import { isValidDateString, todayInShanghai } from '@/lib/dates';
import { db } from '@/lib/db';
import { catMembers, cats } from '@/lib/schema';

export type UpdateCatResult = { ok: true } | { ok: false; error: string };
export type CreateCatResult = { ok: true } | { ok: false; error: string };
export type SetCurrentCatResult = { ok: true } | { ok: false; error: string };

export type SwitcherCat = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
};

export type CatSwitcherData = {
  currentCatId: string;
  cats: SwitcherCat[];
};

function toSwitcherCat(membership: {
  cat: { id: string; name: string; avatarUrl: string | null };
  role: string;
}): SwitcherCat {
  return {
    id: membership.cat.id,
    name: membership.cat.name,
    avatarUrl: membership.cat.avatarUrl,
    role: membership.role,
  };
}

function emptyToNull(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  return value ?? null;
}

const updateCatSchema = z
  .object({
    name: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z
        .string({ error: '请填写名字' })
        .min(1, '请填写名字')
        .max(20, '名字最多 20 个字'),
    ),
    birthEst: z.preprocess(
      emptyToNull,
      z
        .string({ error: '生日格式不正确' })
        .refine(isValidDateString, '生日日期不存在')
        .nullable(),
    ),
    sex: z.enum(['F', 'M', 'U'], '请选择性别'),
    neutered: z.preprocess(
      (value) =>
        value === true || value === 'true' || value === 'on' || value === 1,
      z.boolean({ error: '绝育状态格式不正确' }),
    ),
    neuteredAt: z.preprocess(
      emptyToNull,
      z
        .string({ error: '绝育日期格式不正确' })
        .refine(isValidDateString, '绝育日期不存在')
        .nullable(),
    ),
    isolationStart: z.preprocess(
      emptyToNull,
      z
        .string({ error: '隔离起始日格式不正确' })
        .refine(isValidDateString, '隔离起始日不存在')
        .nullable(),
    ),
    note: z.preprocess(
      emptyToNull,
      z
        .string({ error: '备注格式不正确' })
        .max(200, '备注最多 200 个字')
        .nullable(),
    ),
  })
  .superRefine((data, ctx) => {
    const today = todayInShanghai();

    if (data.birthEst && data.birthEst > today) {
      ctx.addIssue({
        code: 'custom',
        path: ['birthEst'],
        message: '生日不能是未来',
      });
    }

    if (data.neuteredAt && data.birthEst && data.neuteredAt < data.birthEst) {
      ctx.addIssue({
        code: 'custom',
        path: ['neuteredAt'],
        message: '绝育日期不能早于生日',
      });
    }
  });

const createCatSchema = z
  .object({
    name: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z
        .string({ error: '给你的宠物起个名字吧' })
        .min(1, '给你的宠物起个名字吧')
        .max(20, '名字最多 20 个字'),
    ),
    birthEst: z.preprocess(
      emptyToNull,
      z
        .string({ error: '生日格式不正确' })
        .refine(isValidDateString, '生日日期不存在')
        .nullable(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.birthEst && data.birthEst > todayInShanghai()) {
      ctx.addIssue({
        code: 'custom',
        path: ['birthEst'],
        message: '生日不能是未来',
      });
    }
  });

function readCreateCatInput(
  input: FormData | Record<string, unknown>,
): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return input;
  }

  const birthEst = input.get('birth_est') ?? input.get('birthEst');

  return {
    name: input.get('name'),
    birthEst: typeof birthEst === 'string' ? birthEst : null,
  };
}

/**
 * 创建一只新宠物，并把当前用户写成 owner。
 * 欢迎页「我是新家长」和后续的「添加宠物」都走这里。
 */
export async function createCat(
  input: FormData | Record<string, unknown>,
): Promise<CreateCatResult> {
  const parsed = createCatSchema.safeParse(readCreateCatInput(input));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? '宠物信息有误，请检查后重试',
    };
  }

  const user = await requireUser();

  try {
    const catId = randomUUID();
    const data = parsed.data;

    db.transaction((tx) => {
      tx.insert(cats)
        .values({
          id: catId,
          name: data.name,
          birthEst: data.birthEst,
          createdAt: new Date().toISOString(),
        })
        .run();

      tx.insert(catMembers)
        .values({ catId, userId: user.id, role: 'owner' })
        .run();
    });

    // 新增宠物后直接把它设为当前猫，欢迎页 / 档案页都会跳到 /today。
    await writeCurrentCatCookie(catId);

    revalidatePath('/welcome');
    revalidatePath('/today');
    revalidatePath('/profile');

    return { ok: true };
  } catch (error) {
    console.error('[createCat] 创建失败', error);
    return { ok: false, error: '创建失败，请稍后再试' };
  }
}

/**
 * 更新当前猫的档案。
 * catId 不从客户端读取：始终使用 requireCurrentCat() 校验后的当前猫。
 */
export async function updateCat(
  input: Record<string, unknown>,
): Promise<UpdateCatResult> {
  const parsed = updateCatSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? '档案信息有误，请检查后重试',
    };
  }

  const { cat, role } = await requireCurrentCat();

  try {
    if (role !== 'owner') {
      return { ok: false, error: '只有创建者可以修改档案' };
    }

    const data = parsed.data;

    await db
      .update(cats)
      .set({
        name: data.name,
        birthEst: data.birthEst,
        sex: data.sex,
        neutered: data.neutered ? 1 : 0,
        neuteredAt: data.neutered ? data.neuteredAt : null,
        note: data.note,
      })
      .where(eq(cats.id, cat.id));

    // 隔离起始日不在 cats 表里（避免为一个临时状态改表结构），按 catId 存 app_settings。
    saveIsolationStart(cat.id, data.isolationStart ?? null);

    revalidatePath('/profile');
    revalidatePath('/today');

    return { ok: true };
  } catch (error) {
    console.error('[updateCat] 保存失败', error);
    return { ok: false, error: '保存失败，请稍后再试' };
  }
}

const catIdSchema = z.uuid({ error: '猫咪不存在' });

/**
 * 切换当前猫：先校验 membership，再写 per-browser cookie。
 * 客户端不要直接传任意 catId 做写操作，这里始终以 membership 为准。
 */
export async function setCurrentCat(
  catId: string,
): Promise<SetCurrentCatResult> {
  const parsed = catIdSchema.safeParse(catId);
  if (!parsed.success) {
    return { ok: false, error: '猫咪不存在' };
  }

  const user = await requireUser();

  const [membership] = await db
    .select({ catId: catMembers.catId })
    .from(catMembers)
    .where(
      and(
        eq(catMembers.userId, user.id),
        eq(catMembers.catId, parsed.data),
      ),
    )
    .limit(1);

  if (!membership) {
    return { ok: false, error: '没有这只猫的访问权限' };
  }

  await writeCurrentCatCookie(membership.catId);
  revalidatePath('/today');

  return { ok: true };
}

/** PC 侧栏在客户端挂载后拉取切换器需要的数据。 */
export async function getCatSwitcherData(): Promise<CatSwitcherData> {
  const { cat, memberships } = await requireCurrentCat();

  return {
    currentCatId: cat.id,
    cats: memberships.map(toSwitcherCat),
  };
}
