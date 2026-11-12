import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { Download } from 'lucide-react';
import Link from 'next/link';
import CatEmpty from '@/components/CatEmpty';
import {
  AppetiteHeatmap,
  StoolChart,
  VomitChart,
  WeightChart,
  type DailyChartPoint,
} from '@/components/DataCharts';
import { requireUser } from '@/lib/auth';
import { addDays, lastNDates, todayInShanghai } from '@/lib/dates';
import { db } from '@/lib/db';
import { catMembers, cats, dailyLogs } from '@/lib/schema';

export const instant = false;

const RANGE_OPTIONS = [7, 30, 90] as const;

type DataPageProps = {
  searchParams: Promise<{ range?: string | string[] }>;
};

export default async function DataPage({ searchParams }: DataPageProps) {
  const user = await requireUser();
  const { range: rawRange } = await searchParams;
  const range =
    rawRange === '7' || rawRange === '90' ? Number(rawRange) : 30;
  const today = todayInShanghai();

  const [cat] = await db
    .select({
      id: cats.id,
      name: cats.name,
    })
    .from(catMembers)
    .innerJoin(cats, eq(cats.id, catMembers.catId))
    .where(eq(catMembers.userId, user.id))
    .orderBy(asc(catMembers.catId))
    .limit(1);

  if (!cat) {
    return (
      <div className="pb-6">
        <header className="mb-5">
          <p className="text-sm text-muted">健康趋势</p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight">数据</h1>
        </header>

        <section className="rounded-[20px] bg-white shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <CatEmpty
            title="还没有猫咪档案"
            hint="先在档案页建立煤球的基础信息，这里就会开始积累趋势。"
          />
        </section>
      </div>
    );
  }

  // 体重 / 便便 / 呕吐按所选区间展示；食欲热图固定最近 30 天，
  // 所以一次取 max(区间, 30) 天，避免切到 7 天时热图缺数据。
  const lookback = Math.max(range, 30);
  const from = addDays(today, -(lookback - 1));
  const rangeFrom = addDays(today, -(range - 1));

  const logs = await db
    .select({
      logDate: dailyLogs.logDate,
      appetite: dailyLogs.appetite,
      stoolScore: dailyLogs.stoolScore,
      vomitCount: dailyLogs.vomitCount,
      weightG: dailyLogs.weightG,
    })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.catId, cat.id),
        gte(dailyLogs.logDate, from),
        lte(dailyLogs.logDate, today),
      ),
    )
    .orderBy(asc(dailyLogs.logDate));

  const logByDate = new Map(logs.map((log) => [log.logDate, log]));

  const points: DailyChartPoint[] = lastNDates(today, lookback).map((date) => {
    const log = logByDate.get(date);
    const weightG = log?.weightG;

    return {
      date,
      weightKg:
        weightG === null || weightG === undefined ? null : weightG / 1000,
      appetite: log?.appetite ?? null,
      stoolScore: log?.stoolScore ?? null,
      vomitCount: log?.vomitCount ?? null,
    };
  });

  const rangePoints = points.slice(-range);
  const heatmapPoints = points.slice(-30);
  const rangeLogCount = logs.filter(
    (log) => log.logDate >= rangeFrom,
  ).length;

  return (
    <div className="pb-6">
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">健康趋势</p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight">数据</h1>
          </div>

          <a
            href={`/api/export?type=daily&from=${rangeFrom}&to=${today}`}
            className="inline-flex h-11 min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-gold/15 px-3.5 text-xs font-semibold text-gold-deep transition-colors hover:bg-gold/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:text-gold"
          >
            <Download size={15} aria-hidden="true" />
            导出 CSV
          </a>
        </div>

        <p className="mt-1.5 text-xs text-muted">
          最近 {range} 天 · {rangeLogCount} 条记录 · {cat.name}
        </p>
      </header>

      <nav
        aria-label="选择数据区间"
        className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-ink/[0.045] p-1 dark:bg-white/[0.06]"
      >
        {RANGE_OPTIONS.map((option) => {
          const active = option === range;

          return (
            <Link
              key={option}
              href={`/data?range=${option}`}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={`flex h-11 min-h-[44px] items-center justify-center rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                active
                  ? 'bg-gold text-ink shadow-[0_2px_8px_rgba(245,183,49,0.35)]'
                  : 'text-muted hover:text-ink dark:hover:text-cream'
              }`}
            >
              {option} 天
            </Link>
          );
        })}
      </nav>

      {rangeLogCount === 0 ? (
        <section className="rounded-[20px] bg-white shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <CatEmpty
            title="这段时间还没有记录"
            hint={
              <>
                去{' '}
                <Link
                  href="/today"
                  className="font-semibold text-gold-deep underline-offset-2 hover:underline dark:text-gold"
                >
                  今日页
                </Link>{' '}
                记一笔，或换个区间看看。
              </>
            }
          />
        </section>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 md:items-start">
          <section className="min-w-0 rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink dark:text-cream">
                体重曲线
              </h2>
              <span className="text-[10px] text-muted">kg · 缺失日断开</span>
            </div>
            <WeightChart points={rangePoints} />
          </section>

          <section className="min-w-0 rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink dark:text-cream">
                便便评分
              </h2>
              <span className="flex items-center gap-2 text-[10px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-coral" />≥5
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint" />≤3
                </span>
              </span>
            </div>
            <StoolChart points={rangePoints} />
          </section>

          <section className="min-w-0 rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink dark:text-cream">
                食欲热图
              </h2>
              <span className="text-[10px] text-muted">
                最近 30 天 · 越深越好
              </span>
            </div>
            <AppetiteHeatmap points={heatmapPoints} />
          </section>

          <section className="min-w-0 rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink dark:text-cream">
                呕吐次数
              </h2>
              <span className="text-[10px] text-muted">&gt;0 标珊瑚</span>
            </div>
            <VomitChart points={rangePoints} />
          </section>
        </div>
      )}
    </div>
  );
}
