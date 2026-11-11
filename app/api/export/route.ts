import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { getSessionUser } from '@/lib/auth';
import { isValidDateString, todayInShanghai } from '@/lib/dates';
import { db } from '@/lib/db';
import { RECORD_TYPE_LABELS, isRecordType } from '@/lib/record-meta';
import { catMembers, dailyLogs, records, users } from '@/lib/schema';

const DAILY_HEADER = [
  '日期',
  '食欲',
  '饮水',
  '便便评分',
  '排便次数',
  '呕吐次数',
  '精神',
  '体重g',
  '备注',
  '记录人',
  '来源',
] as const;

const RECORDS_HEADER = [
  '类型',
  '名称',
  '日期',
  '剂量',
  '下次到期',
  '费用',
  '医院',
  '备注',
] as const;

type CsvValue = string | number | null | undefined;

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(header: readonly string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

function fail(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status });
}

function sourceLabel(source: string | null): string {
  if (source === 'manual') {
    return '手动';
  }
  if (source === 'ai') {
    return 'AI';
  }
  return source ?? '';
}

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return fail(401, '登录已过期，请重新登录后再试');
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';

  if (type !== 'daily' && type !== 'records') {
    return fail(400, 'type 必须是 daily 或 records');
  }

  if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
    return fail(400, 'from 和 to 必须是合法的 YYYY-MM-DD 日期，且 from 不能晚于 to');
  }

  const [membership] = await db
    .select({ catId: catMembers.catId })
    .from(catMembers)
    .where(eq(catMembers.userId, user.id))
    .orderBy(asc(catMembers.catId))
    .limit(1);

  let csv: string;

  if (type === 'daily') {
    const rows: CsvValue[][] = [];

    if (membership) {
      const logs = await db
        .select({
          logDate: dailyLogs.logDate,
          appetite: dailyLogs.appetite,
          water: dailyLogs.water,
          stoolScore: dailyLogs.stoolScore,
          stoolCount: dailyLogs.stoolCount,
          vomitCount: dailyLogs.vomitCount,
          energy: dailyLogs.energy,
          weightG: dailyLogs.weightG,
          note: dailyLogs.note,
          creatorName: users.displayName,
          creatorEmail: users.email,
          source: dailyLogs.source,
        })
        .from(dailyLogs)
        .leftJoin(users, eq(users.id, dailyLogs.createdBy))
        .where(
          and(
            eq(dailyLogs.catId, membership.catId),
            gte(dailyLogs.logDate, from),
            lte(dailyLogs.logDate, to),
          ),
        )
        .orderBy(asc(dailyLogs.logDate));

      for (const log of logs) {
        rows.push([
          log.logDate,
          log.appetite,
          log.water,
          log.stoolScore,
          log.stoolCount,
          log.vomitCount,
          log.energy,
          log.weightG,
          log.note,
          log.creatorName ?? log.creatorEmail ?? '',
          sourceLabel(log.source),
        ]);
      }
    }

    csv = toCsv(DAILY_HEADER, rows);
  } else {
    const rows: CsvValue[][] = [];

    if (membership) {
      const items = await db
        .select({
          type: records.type,
          name: records.name,
          eventDate: records.eventDate,
          dose: records.dose,
          nextDue: records.nextDue,
          cost: records.cost,
          vet: records.vet,
          note: records.note,
        })
        .from(records)
        .where(
          and(
            eq(records.catId, membership.catId),
            gte(records.eventDate, from),
            lte(records.eventDate, to),
          ),
        )
        .orderBy(asc(records.eventDate));

      for (const item of items) {
        rows.push([
          isRecordType(item.type)
            ? RECORD_TYPE_LABELS[item.type]
            : item.type,
          item.name,
          item.eventDate,
          item.dose,
          item.nextDue,
          item.cost,
          item.vet,
          item.note,
        ]);
      }
    }

    csv = toCsv(RECORDS_HEADER, rows);
  }

  const filenameDate = todayInShanghai().replaceAll('-', '');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cati-${type}-${filenameDate}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
