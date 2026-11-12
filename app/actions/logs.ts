'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { requireCurrentCat } from '@/lib/current-cat';
import { isValidDateString, todayInShanghai } from '@/lib/dates';
import { db } from '@/lib/db';
import { aiParses, dailyLogs, users } from '@/lib/schema';

type MergedWith = { name: string; updatedAt: string };

type SaveLogResult =
  | { ok: true; mergedWith?: MergedWith }
  | { ok: false; error: string };

export type LogConflict = MergedWith;

const aiParseIdSchema = z.uuid();

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

function optionalInteger(min: number, max: number, label: string) {
  return z.preprocess(
    normalizeNumber,
    z
      .number({ error: `${label}必须是数字` })
      .int(`${label}必须是整数`)
      .min(min, `${label}不能小于 ${min}`)
      .max(max, `${label}不能大于 ${max}`)
      .optional(),
  );
}

const saveLogSchema = z
  .object({
    log_date: z
      .string({ error: '请选择记录日期' })
      .min(1, '请选择记录日期')
      .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
      .refine(isValidDateString, '记录日期不存在'),
    appetite: optionalInteger(1, 5, '食欲'),
    water: optionalInteger(1, 5, '饮水'),
    stool_score: optionalInteger(1, 7, '便便评分'),
    stool_count: optionalInteger(0, 10, '便便次数'),
    vomit_count: optionalInteger(0, 10, '呕吐次数'),
    energy: optionalInteger(1, 5, '精神'),
    weight_g: optionalInteger(500, 15000, '体重'),
    note: z.preprocess(
      (value) => {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          return trimmed === '' ? undefined : trimmed;
        }
        return value;
      },
      z
        .string({ error: '备注格式不正确' })
        .max(200, '备注最多 200 个字')
        .optional(),
    ),
  })
  .refine(
    (data) =>
      data.appetite !== undefined ||
      data.water !== undefined ||
      data.stool_score !== undefined ||
      data.stool_count !== undefined ||
      data.vomit_count !== undefined ||
      data.energy !== undefined ||
      data.weight_g !== undefined ||
      data.note !== undefined,
    { message: '请至少填写一项记录' },
  );

function readField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function toRawInput(input: FormData | Record<string, unknown>) {
  if (!(input instanceof FormData)) {
    return input;
  }

  return {
    log_date: readField(input, 'log_date'),
    appetite: readField(input, 'appetite'),
    water: readField(input, 'water'),
    stool_score: readField(input, 'stool_score'),
    stool_count: readField(input, 'stool_count'),
    vomit_count: readField(input, 'vomit_count'),
    energy: readField(input, 'energy'),
    weight_g: readField(input, 'weight_g'),
    note: readField(input, 'note'),
  };
}

const logDateSchema = z
  .string({ error: '请选择记录日期' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
  .refine(isValidDateString, '记录日期不存在');

/** 昵称优先，空昵称显示邮箱前缀。 */
function recorderName(recorder: {
  displayName: string | null;
  email: string;
}): string {
  return (
    recorder.displayName?.trim() ||
    recorder.email.split('@')[0] ||
    '家人'
  );
}

async function findRecorderName(userId: string): Promise<string | null> {
  const [recorder] = await db
    .select({ displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return recorder ? recorderName(recorder) : null;
}

/**
 * 抽屉打开 / 切换日期时查询冲突：该日期已有记录，且最后记录人不是当前用户。
 * 只读，不写库。
 */
export async function getLogConflict(
  logDate: string,
): Promise<LogConflict | null> {
  const parsed = logDateSchema.safeParse(logDate);
  if (!parsed.success) {
    return null;
  }

  const user = await requireUser();
  const { cat } = await requireCurrentCat();

  const [existing] = await db
    .select({
      createdBy: dailyLogs.createdBy,
      updatedBy: dailyLogs.updatedBy,
      createdAt: dailyLogs.createdAt,
      updatedAt: dailyLogs.updatedAt,
    })
    .from(dailyLogs)
    .where(
      and(eq(dailyLogs.catId, cat.id), eq(dailyLogs.logDate, parsed.data)),
    )
    .limit(1);

  if (!existing) {
    return null;
  }

  const recorderId = existing.updatedBy ?? existing.createdBy;
  if (!recorderId || recorderId === user.id) {
    return null;
  }

  return {
    name: (await findRecorderName(recorderId)) ?? '家人',
    updatedAt: existing.updatedAt ?? existing.createdAt,
  };
}

/**
 * 今日页的唯一写入口：同一天 upsert，只更新本次显式填写的字段。
 * 监控页只新增不编辑，因此这里不接受客户端传来的 catId / 记录 id。
 */
export async function saveLog(
  input: FormData | Record<string, unknown>,
  aiParseId?: string | null,
): Promise<SaveLogResult> {
  const parsed = saveLogSchema.safeParse(toRawInput(input));
  const parsedAiParseId = aiParseId
    ? aiParseIdSchema.safeParse(aiParseId)
    : null;

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? '记录内容有误，请检查后重试',
    };
  }

  const data = parsed.data;
  const today = todayInShanghai();

  if (data.log_date > today) {
    return { ok: false, error: '不能记录未来的日期' };
  }

  // 在 try 外取用户和当前猫：redirect() 不能被下面的 catch 吞掉。
  const user = await requireUser();
  const { cat } = await requireCurrentCat();

  let mergedWith: MergedWith | undefined;

  try {
    // 同一天已有记录、且最后记录人不是当前用户时，仍允许合并，
    // 但把对方信息带回前端，让用户知道保存会合并到谁的记录里。
    const [existing] = await db
      .select({
        createdBy: dailyLogs.createdBy,
        updatedBy: dailyLogs.updatedBy,
        createdAt: dailyLogs.createdAt,
        updatedAt: dailyLogs.updatedAt,
      })
      .from(dailyLogs)
      .where(
        and(
          eq(dailyLogs.catId, cat.id),
          eq(dailyLogs.logDate, data.log_date),
        ),
      )
      .limit(1);

    const previousRecorderId =
      existing?.updatedBy ?? existing?.createdBy ?? null;
    if (existing && previousRecorderId && previousRecorderId !== user.id) {
      mergedWith = {
        name: (await findRecorderName(previousRecorderId)) ?? '家人',
        updatedAt: existing.updatedAt ?? existing.createdAt,
      };
    }

    // 只把本次填写的字段放进 set：空字段保持原值，不会被覆盖。
    const providedFields = {
      ...(data.appetite !== undefined ? { appetite: data.appetite } : {}),
      ...(data.water !== undefined ? { water: data.water } : {}),
      ...(data.stool_score !== undefined
        ? { stoolScore: data.stool_score }
        : {}),
      ...(data.stool_count !== undefined
        ? { stoolCount: data.stool_count }
        : {}),
      ...(data.vomit_count !== undefined
        ? { vomitCount: data.vomit_count }
        : {}),
      ...(data.energy !== undefined ? { energy: data.energy } : {}),
      ...(data.weight_g !== undefined ? { weightG: data.weight_g } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
    };

    const now = new Date().toISOString();

    await db
      .insert(dailyLogs)
      .values({
        id: randomUUID(),
        catId: cat.id,
        logDate: data.log_date,
        ...providedFields,
        source: 'manual',
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [dailyLogs.catId, dailyLogs.logDate],
        set: {
          ...providedFields,
          source: 'manual',
          // createdBy 保留第一次记录的人，只更新“最后记录人”。
          updatedBy: user.id,
          updatedAt: now,
        },
      });

    // 用户确认保存后，把对应的 AI 解析标记为已采纳；标记失败不影响日志本身。
    if (parsedAiParseId?.success) {
      try {
        await db
          .update(aiParses)
          .set({ accepted: 1 })
          .where(
            and(
              eq(aiParses.id, parsedAiParseId.data),
              eq(aiParses.userId, user.id),
            ),
          );
      } catch (error) {
        console.error('[saveLog] 标记 AI 解析已采纳失败', error);
      }
    }
  } catch (error) {
    console.error('[saveLog] 保存失败', error);
    return { ok: false, error: '保存失败，请稍后再试' };
  }

  revalidatePath('/today');
  return mergedWith ? { ok: true, mergedWith } : { ok: true };
}
