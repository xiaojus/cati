'use server';

import { and, asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { isValidDateString } from '@/lib/dates';
import { db } from '@/lib/db';
import {
  RECORD_TYPES,
  defaultNextDue,
  type RecordType,
} from '@/lib/record-meta';
import { catMembers, records } from '@/lib/schema';

export type SaveRecordResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type DeleteRecordResult = { ok: true } | { ok: false; error: string };

function normalizeNumber(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return undefined;
    }
    return Number(trimmed);
  }

  return value;
}

function emptyToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  return value;
}

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalText(max: number, label: string) {
  return z.preprocess(
    (value) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
      }
      return value;
    },
    z
      .string({ error: `${label}格式不正确` })
      .max(max, `${label}最多 ${max} 个字`)
      .optional(),
  );
}

const saveRecordSchema = z.object({
  id: z.preprocess(emptyToUndefined, z.uuid('记录编号不正确').optional()),
  type: z.enum(RECORD_TYPES, '请选择记录类型'),
  name: z.preprocess(
    trimString,
    z
      .string({ error: '请填写名称' })
      .min(1, '请填写名称')
      .max(40, '名称最多 40 个字'),
  ),
  event_date: z
    .string({ error: '请选择日期' })
    .min(1, '请选择日期')
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
    .refine(isValidDateString, '日期不存在'),
  dose: optionalText(40, '剂量'),
  drug_name: optionalText(60, '药名'),
  dose_mg: z.preprocess(
    normalizeNumber,
    z
      .number({ error: '剂量（mg）必须是数字' })
      .min(0, '剂量（mg）不能小于 0')
      .max(100_000, '剂量（mg）不能超过 100000')
      .optional(),
  ),
  weight_g: z.preprocess(
    normalizeNumber,
    z
      .number({ error: '当时体重必须是数字' })
      .int('当时体重必须是整数')
      .min(500, '当时体重不能小于 500g')
      .max(15_000, '当时体重不能超过 15000g')
      .optional(),
  ),
  next_due: z.preprocess(
    emptyToUndefined,
    z
      .string({ error: '下次到期日格式不正确' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, '下次到期日格式应为 YYYY-MM-DD')
      .refine(isValidDateString, '下次到期日不存在')
      .optional(),
  ),
  cost: z.preprocess(
    normalizeNumber,
    z
      .number({ error: '费用必须是数字' })
      .min(0, '费用不能小于 0')
      .max(1_000_000, '费用不能超过 1000000')
      .optional(),
  ),
  vet: optionalText(60, '医院'),
  note: optionalText(200, '备注'),
});

function readField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function toRawInput(input: FormData | Record<string, unknown>) {
  if (!(input instanceof FormData)) {
    return input;
  }

  return {
    id: readField(input, 'id'),
    type: readField(input, 'type'),
    name: readField(input, 'name'),
    event_date: readField(input, 'event_date'),
    dose: readField(input, 'dose'),
    drug_name: readField(input, 'drug_name'),
    dose_mg: readField(input, 'dose_mg'),
    weight_g: readField(input, 'weight_g'),
    next_due: readField(input, 'next_due'),
    cost: readField(input, 'cost'),
    vet: readField(input, 'vet'),
    note: readField(input, 'note'),
  };
}

async function findWritableCat(userId: string): Promise<string | null> {
  const [membership] = await db
    .select({ catId: catMembers.catId })
    .from(catMembers)
    .where(eq(catMembers.userId, userId))
    .orderBy(asc(catMembers.catId))
    .limit(1);

  return membership?.catId ?? null;
}

function revalidateRecordPages(): void {
  revalidatePath('/records');
  revalidatePath('/today');
}

/**
 * 新增或编辑一条健康记录。
 * id 为空时新增；带 id 时只允许修改当前用户所属猫咪的记录。
 */
export async function saveRecord(
  input: FormData | Record<string, unknown>,
): Promise<SaveRecordResult> {
  const parsed = saveRecordSchema.safeParse(toRawInput(input));

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? '记录内容有误，请检查后重试',
    };
  }

  const data = parsed.data;
  const type: RecordType = data.type;
  const nextDue = data.next_due ?? defaultNextDue(type, data.event_date);

  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: '登录已过期，请重新登录后再试' };
  }

  try {
    const catId = await findWritableCat(user.id);
    if (!catId) {
      return { ok: false, error: '还没有猫咪档案，暂时不能保存记录' };
    }

    // 用药明细只对驱虫记录有意义；其他类型即使客户端传了也清成 null。
    const isDeworm = type === 'deworm_in' || type === 'deworm_out';

    const sharedFields = {
      type,
      name: data.name,
      eventDate: data.event_date,
      dose: data.dose ?? null,
      drugName: isDeworm ? (data.drug_name ?? null) : null,
      doseMg: isDeworm ? (data.dose_mg ?? null) : null,
      weightG: isDeworm ? (data.weight_g ?? null) : null,
      nextDue,
      cost: data.cost ?? null,
      vet: data.vet ?? null,
      note: data.note ?? null,
    };

    if (data.id) {
      const [existing] = await db
        .select({ id: records.id })
        .from(records)
        .where(and(eq(records.id, data.id), eq(records.catId, catId)))
        .limit(1);

      if (!existing) {
        return { ok: false, error: '记录不存在，或你无权修改' };
      }

      await db
        .update(records)
        .set(sharedFields)
        .where(and(eq(records.id, data.id), eq(records.catId, catId)));

      revalidateRecordPages();
      return { ok: true, id: data.id };
    }

    const id = randomUUID();
    await db.insert(records).values({
      id,
      catId,
      ...sharedFields,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    });

    revalidateRecordPages();
    return { ok: true, id };
  } catch (error) {
    console.error('[saveRecord] 保存失败', error);
    return { ok: false, error: '保存失败，请稍后再试' };
  }
}

/** 删除一条记录；只允许删除当前用户所属猫咪的记录。 */
export async function deleteRecord(id: string): Promise<DeleteRecordResult> {
  const parsedId = z.uuid('记录编号不正确').safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: '记录编号不正确' };
  }

  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: '登录已过期，请重新登录后再试' };
  }

  try {
    const catId = await findWritableCat(user.id);
    if (!catId) {
      return { ok: false, error: '还没有猫咪档案，暂时不能删除记录' };
    }

    const [existing] = await db
      .select({ id: records.id })
      .from(records)
      .where(and(eq(records.id, parsedId.data), eq(records.catId, catId)))
      .limit(1);

    if (!existing) {
      return { ok: false, error: '记录不存在，或你无权删除' };
    }

    await db
      .delete(records)
      .where(and(eq(records.id, parsedId.data), eq(records.catId, catId)));

    revalidateRecordPages();
    return { ok: true };
  } catch (error) {
    console.error('[deleteRecord] 删除失败', error);
    return { ok: false, error: '删除失败，请稍后再试' };
  }
}
