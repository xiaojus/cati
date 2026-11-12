import type { Metadata } from 'next';
import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { ShareWeightChart } from '@/components/ShareLinkCard';
import {
  formatAgeLabel,
  formatDateCn,
  formatWeekdayCn,
  lastNDates,
  todayInShanghai,
} from '@/lib/dates';
import { db } from '@/lib/db';
import { cats, dailyLogs, records, shareLinks } from '@/lib/schema';

/**
 * 分享页按请求读库：token 校验、过期判断和「最近 7 天」都依赖当前时间。
 *
 * 任务卡写的是 `dynamic = 'force-dynamic'`，但 Next 16.4 在
 * `cacheComponents: true` 下会直接拒绝任何 dynamic 段配置（构建报错）。
 * 按 Next 16 的方式改用 `instant = false` 允许路由阻塞在服务端渲染；
 * 根布局读取 cookies() 且本页没有 `use cache`，路由仍是每次请求渲染，
 * 失效链接不会被静态化。
 */
export const instant = false;

export const metadata: Metadata = {
  title: '给兽医看的一周摘要',
  robots: { index: false, follow: false },
};

const TOKEN_PATTERN = /^[A-Za-z0-9]{32}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const RECORD_TYPE_LABELS: Record<string, string> = {
  vaccine: '疫苗',
  deworm_in: '体内驱虫',
  deworm_out: '体外驱虫',
  visit: '就诊',
  med: '用药',
};

function formatDateTimeCn(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return iso;
  }

  // sv-SE 的格式就是 YYYY-MM-DD HH:mm，和任务卡里的页脚样例一致。
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

function recordDetails(record: {
  type: string;
  dose: string | null;
  drugName: string | null;
  doseMg: number | null;
  weightG: number | null;
  vet: string | null;
}): string[] {
  const details: string[] = [];

  if (record.drugName) {
    details.push(`药名 ${record.drugName}`);
  }

  if (record.doseMg !== null && record.doseMg !== undefined) {
    details.push(
      `剂量 ${Number.isInteger(record.doseMg) ? record.doseMg : record.doseMg.toFixed(2)} mg`,
    );
  } else if (record.dose) {
    details.push(`剂量 ${record.dose}`);
  }

  if (record.weightG !== null) {
    details.push(`当时体重 ${(record.weightG / 1000).toFixed(2)} kg`);
  }

  if (record.vet) {
    details.push(`医院 ${record.vet}`);
  }

  return details;
}

function InvalidLinkPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[420px] rounded-[20px] bg-white p-8 text-center shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
        <h1 className="text-lg font-bold text-ink dark:text-cream">
          这个链接已失效
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          分享链接可能已过期或被主人作废，请让主人重新生成。
        </p>
      </div>
    </main>
  );
}

type SharePageProps = {
  params: Promise<{ token: string }>;
};

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;

  if (!TOKEN_PATTERN.test(token)) {
    return <InvalidLinkPage />;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const [link] = await db
    .select({
      catId: shareLinks.catId,
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)))
    .limit(1);

  if (!link || link.expiresAt <= nowIso) {
    return <InvalidLinkPage />;
  }

  const [cat] = await db
    .select({
      name: cats.name,
      birthEst: cats.birthEst,
      sex: cats.sex,
      neutered: cats.neutered,
    })
    .from(cats)
    .where(eq(cats.id, link.catId))
    .limit(1);

  if (!cat) {
    return <InvalidLinkPage />;
  }

  const today = todayInShanghai(now);
  const weekDates = lastNDates(today, 7);

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
    })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.catId, link.catId),
        gte(dailyLogs.logDate, weekDates[0]),
        lte(dailyLogs.logDate, today),
      ),
    )
    .orderBy(asc(dailyLogs.logDate));

  const logByDate = new Map(logs.map((log) => [log.logDate, log]));
  const weightPoints = weekDates.map((date) => {
    const weightG = logByDate.get(date)?.weightG;
    return {
      date,
      weightKg: weightG === null || weightG === undefined ? null : weightG / 1000,
    };
  });

  const recentRecords = await db
    .select({
      id: records.id,
      type: records.type,
      name: records.name,
      eventDate: records.eventDate,
      dose: records.dose,
      drugName: records.drugName,
      doseMg: records.doseMg,
      weightG: records.weightG,
      nextDue: records.nextDue,
      vet: records.vet,
    })
    .from(records)
    .where(eq(records.catId, link.catId))
    .orderBy(desc(records.eventDate), desc(records.createdAt))
    .limit(20);

  const sexLabel = cat.sex === 'F' ? '母' : cat.sex === 'M' ? '公' : '未知';
  const ageLabel = formatAgeLabel(cat.birthEst, today) ?? '年龄未知';
  const neuteredLabel = cat.neutered === 1 ? '已绝育' : '未绝育';
  const remainingDays = Math.max(
    1,
    Math.ceil(
      (new Date(link.expiresAt).getTime() - now.getTime()) / MS_PER_DAY,
    ),
  );

  return (
    <main className="min-h-dvh px-5 py-6 md:px-8 md:py-10">
      <div className="mx-auto w-full max-w-[480px] md:max-w-3xl">
        <header className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <p className="text-[11px] font-medium text-muted">
            给兽医看的一周摘要
          </p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight text-ink dark:text-cream">
            {cat.name}
          </h1>
          <p className="mt-1.5 text-xs text-muted">
            {sexLabel} · {ageLabel} · {neuteredLabel}
          </p>
          <p className="mt-3 rounded-xl bg-gold/10 px-3 py-2 text-[11px] font-medium leading-5 text-gold-deep dark:text-gold">
            数据由主人记录，非医疗诊断。
          </p>
        </header>

        <section className="mt-4 rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink dark:text-cream">
              最近 7 天
            </h2>
            <span className="text-[10px] text-muted">
              {weekDates[0]} 至 {today}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-[10px] font-medium text-muted">
                  <th className="py-2 pr-3 font-medium">日期</th>
                  <th className="py-2 pr-3 font-medium">食欲</th>
                  <th className="py-2 pr-3 font-medium">饮水</th>
                  <th className="py-2 pr-3 font-medium">便便</th>
                  <th className="py-2 pr-3 font-medium">排便次数</th>
                  <th className="py-2 pr-3 font-medium">呕吐</th>
                  <th className="py-2 pr-3 font-medium">精神</th>
                  <th className="py-2 font-medium">体重</th>
                </tr>
              </thead>
              <tbody>
                {weekDates.map((date) => {
                  const log = logByDate.get(date);

                  return (
                    <tr
                      key={date}
                      className="border-t border-ink/[0.06] text-ink dark:border-white/10 dark:text-cream"
                    >
                      <td className="whitespace-nowrap py-2 pr-3 font-medium">
                        {formatDateCn(date)}
                        <span className="ml-1 text-[10px] font-normal text-muted">
                          {formatWeekdayCn(date)}
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {log?.appetite ?? '—'}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {log?.water ?? '—'}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {log?.stoolScore ?? '—'}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {log?.stoolCount ?? '—'}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {log?.vomitCount ?? '—'}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {log?.energy ?? '—'}
                      </td>
                      <td className="whitespace-nowrap py-2 tabular-nums">
                        {log?.weightG === null || log?.weightG === undefined
                          ? '—'
                          : `${(log.weightG / 1000).toFixed(2)} kg`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-4 rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink dark:text-cream">
              体重趋势
            </h2>
            <span className="text-[10px] text-muted">kg · 缺失日断开</span>
          </div>
          <ShareWeightChart points={weightPoints} />
        </section>

        <section className="mt-4 rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <h2 className="text-sm font-semibold text-ink dark:text-cream">
            近期记录
          </h2>
          <p className="mt-0.5 text-[10px] text-muted">
            疫苗 · 驱虫 · 就诊 · 用药
          </p>

          {recentRecords.length === 0 ? (
            <p className="mt-3 text-xs text-muted">
              还没有疫苗、驱虫或就诊记录。
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentRecords.map((record) => {
                const label = RECORD_TYPE_LABELS[record.type] ?? '记录';
                const details = recordDetails(record);

                return (
                  <li
                    key={record.id}
                    className="rounded-2xl bg-ink/[0.035] p-3 dark:bg-white/[0.04]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink dark:text-cream">
                          {record.name ?? label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {label} · {formatDateCn(record.eventDate)}
                        </p>
                      </div>

                      {record.nextDue ? (
                        <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-gold-deep dark:text-gold">
                          下次 {formatDateCn(record.nextDue)}
                        </span>
                      ) : null}
                    </div>

                    {details.length > 0 ? (
                      <p className="mt-1.5 text-[11px] leading-5 text-muted">
                        {details.join(' · ')}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="mt-5 text-center text-[10px] leading-5 text-muted">
          生成于 {formatDateTimeCn(link.createdAt)} · 链接 {remainingDays} 天后失效
        </footer>
      </div>
    </main>
  );
}
