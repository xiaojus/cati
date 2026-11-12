'use server';

import { asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { isValidDateString, todayInShanghai } from '@/lib/dates';
import { db } from '@/lib/db';
import { catMembers, cats } from '@/lib/schema';

export type UpdateCatResult = { ok: true } | { ok: false; error: string };

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

/**
 * 更新当前用户绑定猫咪的档案。
 * catId 不从客户端读取：始终使用当前用户在 cat_members 中的那条记录。
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

  const user = await requireUser();

  try {
    const [membership] = await db
      .select({ catId: catMembers.catId, role: catMembers.role })
      .from(catMembers)
      .where(eq(catMembers.userId, user.id))
      .orderBy(asc(catMembers.catId))
      .limit(1);

    if (!membership) {
      return { ok: false, error: '还没有猫咪档案' };
    }

    if (membership.role !== 'owner') {
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
      .where(eq(cats.id, membership.catId));

    revalidatePath('/profile');
    revalidatePath('/today');

    return { ok: true };
  } catch (error) {
    console.error('[updateCat] 保存失败', error);
    return { ok: false, error: '保存失败，请稍后再试' };
  }
}
