'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { saveHospitalInfo } from '@/lib/app-settings';
import { db } from '@/lib/db';
import type { HospitalInfo } from '@/lib/hospital';
import { catMembers } from '@/lib/schema';

export type SaveHospitalResult =
  | { ok: true }
  | { ok: false; error: string };

const catIdSchema = z.uuid('档案编号不正确');

const hospitalSchema = z.object({
  name: z
    .string({ error: '请填写医院名称' })
    .trim()
    .min(1, '请填写医院名称')
    .max(60, '医院名称最多 60 个字'),
  phone: z
    .string({ error: '电话格式不正确' })
    .trim()
    .max(30, '电话最多 30 个字符'),
  address: z
    .string({ error: '地址格式不正确' })
    .trim()
    .max(120, '地址最多 120 个字'),
});

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function saveHospital(
  catId: string,
  input: FormData | Record<string, unknown>,
): Promise<SaveHospitalResult> {
  const parsedCatId = catIdSchema.safeParse(catId);
  if (!parsedCatId.success) {
    return { ok: false, error: '档案编号不正确' };
  }

  const raw =
    input instanceof FormData
      ? {
          name: readField(input, 'name'),
          phone: readField(input, 'phone'),
          address: readField(input, 'address'),
        }
      : input;

  const parsed = hospitalSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? '医院信息有误，请检查后重试',
    };
  }

  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: '登录已过期，请重新登录后再试' };
  }

  try {
    const [membership] = await db
      .select({ catId: catMembers.catId })
      .from(catMembers)
      .where(
        and(
          eq(catMembers.catId, parsedCatId.data),
          eq(catMembers.userId, user.id),
        ),
      )
      .limit(1);

    if (!membership) {
      return { ok: false, error: '没有权限编辑这只猫的档案' };
    }

    const hospital: HospitalInfo = {
      name: parsed.data.name,
      phone: parsed.data.phone,
      address: parsed.data.address,
    };
    saveHospitalInfo(parsedCatId.data, hospital);

    revalidatePath('/profile');
    return { ok: true };
  } catch (error) {
    console.error('[saveHospital] 保存失败', error);
    return { ok: false, error: '保存失败，请稍后再试' };
  }
}
