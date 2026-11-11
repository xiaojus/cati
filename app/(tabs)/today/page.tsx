import { and, asc, desc, eq, gt, gte, isNotNull, lte } from 'drizzle-orm';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Droplets,
  Minus,
  Smile,
  Utensils,
} from 'lucide-react';
import QuickLogSheet from '@/components/QuickLogSheet';
import Sparkline from '@/components/Sparkline';
import { requireUser } from '@/lib/auth';
import {
  addDays,
  daysBetween,
  formatAgeLabel,
  formatDateCn,
  formatTimeCn,
  formatWeekdayCn,
  inclusiveDayNumber,
  isValidDateString,
  lastNDates,
  todayInShanghai,
} from '@/lib/dates';
import { db } from '@/lib/db';
import { catMembers, cats, dailyLogs, records, users } from '@/lib/schema';

// cacheComponents 下顶层读取 cookies() 会阻塞预渲染，这里显式允许阻塞。
export const instant = false;

/** T4 任务卡规定的固定隔离起始日；档案页落地前先作为常量。 */
const ISOLATION_START = '2026-11-11';

type RecentLog = {
  logDate: string;
  appetite: number | null;
  water: number | null;
  stoolScore: number | null;
  vomitCount: number | null;
  energy: number | null;
};

const METRIC_CARDS = [
  {
    key: 'appetite',
    label: '食欲',
    unit: '1–5 分',
    min: 1,
    max: 5,
    icon: Utensils,
  },
  {
    key: 'water',
    label: '饮水',
    unit: '1–5 分',
    min: 1,
    max: 5,
    icon: Droplets,
  },
  {
    key: 'stoolScore',
    label: '便便',
    unit: '1–7 分',
    min: 1,
    max: 7,
    icon: Activity,
  },
  {
    key: 'energy',
    label: '精神',
    unit: '1–5 分',
    min: 1,
    max: 5,
    icon: Smile,
  },
] as const;

type MetricKey = (typeof METRIC_CARDS)[number]['key'];

const RECORD_TYPE_LABELS: Record<string, string> = {
  vaccine: '疫苗',
  deworm_in: '驱虫',
  deworm_out: '驱虫',
  visit: '就诊',
  med: '用药',
};

const ALERT_STYLES = {
  coral: {
    container: 'border-coral/25 bg-coral/10',
    icon: 'text-coral',
    title: 'text-coral',
  },
  gold: {
    container: 'border-gold/35 bg-gold/15',
    icon: 'text-gold-deep dark:text-gold',
    title: 'text-gold-deep dark:text-gold',
  },
  muted: {
    container:
      'border-ink/[0.06] bg-ink/[0.035] dark:border-white/10 dark:bg-white/[0.04]',
    icon: 'text-muted',
    title: 'text-muted',
  },
} as const;

type AlertTone = keyof typeof ALERT_STYLES;

type Alert = {
  tone: AlertTone;
  title: string;
  detail: string;
};

type Trend = 'up' | 'down' | 'flat' | 'none';

type DueRecord = {
  type: string;
  name: string | null;
  nextDue: string;
};

function formatKg(grams: number): string {
  return (grams / 1000).toFixed(2);
}

function metricTone(key: MetricKey, value: number | null): string {
  if (value === null) {
    return 'text-muted';
  }

  if (key === 'stoolScore') {
    if (value >= 5) {
      return 'text-coral';
    }
    if (value <= 2) {
      return 'text-gold-deep dark:text-gold';
    }
    return 'text-mint';
  }

  if (value <= 2) {
    return 'text-coral';
  }
  if (value === 3) {
    return 'text-gold-deep dark:text-gold';
  }
  return 'text-mint';
}

function trendFor(
  value: number | null,
  series: Array<number | null>,
): { trend: Trend; mean: number | null } {
  const recorded = series.filter((item): item is number => item !== null);

  if (value === null || recorded.length === 0) {
    return { trend: 'none', mean: null };
  }

  const mean =
    recorded.reduce((sum, item) => sum + item, 0) / recorded.length;
  const diff = value - mean;

  if (Math.abs(diff) <= 0.3) {
    return { trend: 'flat', mean };
  }

  return { trend: diff > 0 ? 'up' : 'down', mean };
}

function recentStreak(
  dates: string[],
  getLog: (date: string) => RecentLog | null,
  predicate: (log: RecentLog) => boolean,
): number {
  let streak = 0;
  let best = 0;

  // 从今天向过去扫描，找到最近一段连续满足条件的天数。
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const log = getLog(dates[index]);

    if (log && predicate(log)) {
      streak += 1;
      best = Math.max(best, streak);
    } else {
      if (best >= 2) {
        break;
      }
      streak = 0;
    }
  }

  return best >= 2 ? best : 0;
}

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === 'up') {
    return <ArrowUp size={14} aria-hidden="true" />;
  }
  if (trend === 'down') {
    return <ArrowDown size={14} aria-hidden="true" />;
  }
  if (trend === 'flat') {
    return <Minus size={14} aria-hidden="true" />;
  }
  return null;
}

function TodayHeader({
  today,
  userName,
}: {
  today: string;
  userName: string;
}) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-muted">
          {formatDateCn(today)} · {formatWeekdayCn(today)}
        </p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight text-ink dark:text-cream">
          今日
        </h1>
      </div>
      <p className="max-w-[45%] truncate pb-1 text-right text-xs text-muted">
        你好，{userName}
      </p>
    </header>
  );
}

function CatAvatar() {
  return (
    <svg
      viewBox="0 0 80 80"
      role="img"
      aria-label="黑猫头像占位图"
      className="h-full w-full"
    >
      <path
        d="M16 18 L22 34 C17.5 39.5 15.5 45.5 15.5 51.5 C15.5 66 26.5 74 40 74 C53.5 74 64.5 66 64.5 51.5 C64.5 45.5 62.5 39.5 58 34 L64 18 L50 26.5 C47 25 43.5 24.2 40 24.2 C36.5 24.2 33 25 30 26.5 Z"
        fill="#17151A"
        stroke="rgba(255,249,240,0.18)"
        strokeWidth="1"
      />
      <ellipse cx="31.5" cy="48.5" rx="6" ry="7" fill="#F5B731" />
      <ellipse cx="48.5" cy="48.5" rx="6" ry="7" fill="#F5B731" />
      <ellipse cx="31.5" cy="48.5" rx="1.8" ry="4.6" fill="#17151A" />
      <ellipse cx="48.5" cy="48.5" rx="1.8" ry="4.6" fill="#17151A" />
      <path
        d="M37.5 58.5 Q40 61 42.5 58.5 Q40 57.2 37.5 58.5 Z"
        fill="#E86A4D"
      />
    </svg>
  );
}

export default async function TodayPage() {
  const user = await requireUser();
  const today = todayInShanghai();
  const userName = user.displayName ?? user.email;

  const [cat] = await db
    .select({
      id: cats.id,
      name: cats.name,
      birthEst: cats.birthEst,
      sex: cats.sex,
      avatarUrl: cats.avatarUrl,
    })
    .from(catMembers)
    .innerJoin(cats, eq(cats.id, catMembers.catId))
    .where(eq(catMembers.userId, user.id))
    .orderBy(asc(catMembers.catId))
    .limit(1);

  if (!cat) {
    return (
      <div className="pb-20">
        <TodayHeader today={today} userName={userName} />
        <section className="rounded-[20px] bg-white p-6 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold-deep dark:text-gold">
            <Activity size={26} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-ink dark:text-cream">
            还没有猫咪档案
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            先建立煤球的基础档案，就能在这里记录每日状态了。
          </p>
        </section>
      </div>
    );
  }

  const weekDates = lastNDates(today, 7);
  const sevenDaysAgo = addDays(today, -7);

  const recentLogs = await db
    .select({
      logDate: dailyLogs.logDate,
      appetite: dailyLogs.appetite,
      water: dailyLogs.water,
      stoolScore: dailyLogs.stoolScore,
      vomitCount: dailyLogs.vomitCount,
      energy: dailyLogs.energy,
    })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.catId, cat.id),
        gte(dailyLogs.logDate, weekDates[0]),
        lte(dailyLogs.logDate, today),
      ),
    )
    .orderBy(asc(dailyLogs.logDate));

  const logByDate = new Map(recentLogs.map((log) => [log.logDate, log]));
  const getLog = (date: string): RecentLog | null =>
    logByDate.get(date) ?? null;

  const [todayStatus] = await db
    .select({
      createdAt: dailyLogs.createdAt,
      creatorName: users.displayName,
      creatorEmail: users.email,
    })
    .from(dailyLogs)
    .leftJoin(users, eq(users.id, dailyLogs.createdBy))
    .where(and(eq(dailyLogs.catId, cat.id), eq(dailyLogs.logDate, today)))
    .limit(1);

  const recentWeights = await db
    .select({
      logDate: dailyLogs.logDate,
      weightG: dailyLogs.weightG,
    })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.catId, cat.id),
        isNotNull(dailyLogs.weightG),
        lte(dailyLogs.logDate, today),
      ),
    )
    .orderBy(desc(dailyLogs.logDate))
    .limit(2);

  const weightRows = recentWeights.filter(
    (row): row is { logDate: string; weightG: number } =>
      row.weightG !== null,
  );
  const latestWeight = weightRows[0] ?? null;
  const previousWeight = weightRows[1] ?? null;

  const weightSevenDaysAgoRows = await db
    .select({
      logDate: dailyLogs.logDate,
      weightG: dailyLogs.weightG,
    })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.catId, cat.id),
        isNotNull(dailyLogs.weightG),
        lte(dailyLogs.logDate, sevenDaysAgo),
      ),
    )
    .orderBy(desc(dailyLogs.logDate))
    .limit(1);

  const weightSevenDaysAgo =
    weightSevenDaysAgoRows.find(
      (row): row is { logDate: string; weightG: number } =>
        row.weightG !== null,
    ) ?? null;

  const [latestVomit] = await db
    .select({ logDate: dailyLogs.logDate })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.catId, cat.id),
        gt(dailyLogs.vomitCount, 0),
        gte(dailyLogs.logDate, sevenDaysAgo),
        lte(dailyLogs.logDate, today),
      ),
    )
    .orderBy(desc(dailyLogs.logDate))
    .limit(1);

  const [latestLog] = await db
    .select({ logDate: dailyLogs.logDate })
    .from(dailyLogs)
    .where(and(eq(dailyLogs.catId, cat.id), lte(dailyLogs.logDate, today)))
    .orderBy(desc(dailyLogs.logDate))
    .limit(1);

  const dueRecords = await db
    .select({
      type: records.type,
      name: records.name,
      nextDue: records.nextDue,
    })
    .from(records)
    .where(and(eq(records.catId, cat.id), isNotNull(records.nextDue)))
    .orderBy(asc(records.nextDue));

  const validDue = dueRecords.filter(
    (record): record is DueRecord =>
      record.nextDue !== null && isValidDateString(record.nextDue),
  );
  const nextDue =
    validDue.find((record) => record.nextDue >= today) ??
    [...validDue].reverse().find((record) => record.nextDue < today) ??
    null;

  const softStoolStreak = recentStreak(
    weekDates,
    getLog,
    (log) => (log.stoolScore ?? 0) >= 5,
  );
  const poorAppetiteStreak = recentStreak(
    weekDates,
    getLog,
    (log) => log.appetite !== null && log.appetite <= 2,
  );

  const weightDiff =
    latestWeight && previousWeight
      ? latestWeight.weightG - previousWeight.weightG
      : null;

  const weightDropPct =
    latestWeight &&
    weightSevenDaysAgo &&
    latestWeight.logDate > weightSevenDaysAgo.logDate &&
    weightSevenDaysAgo.weightG > 0
      ? ((weightSevenDaysAgo.weightG - latestWeight.weightG) /
          weightSevenDaysAgo.weightG) *
        100
      : null;

  const daysSinceLastLog = latestLog
    ? daysBetween(latestLog.logDate, today)
    : null;

  const alerts: Alert[] = [];

  if (softStoolStreak >= 2) {
    alerts.push({
      tone: 'coral',
      title: `连续 ${softStoolStreak} 天软便`,
      detail: '最近 7 天便便评分连续 ≥ 5，注意补水和观察。',
    });
  }

  if (poorAppetiteStreak >= 2) {
    alerts.push({
      tone: 'coral',
      title: `连续 ${poorAppetiteStreak} 天食欲差`,
      detail: '食欲评分连续 ≤ 2，留意进食量和精神。',
    });
  }

  if (
    latestWeight &&
    weightSevenDaysAgo &&
    weightDropPct !== null &&
    weightDropPct > 5
  ) {
    alerts.push({
      tone: 'coral',
      title: `体重下降 ${weightDropPct.toFixed(1)}%`,
      detail: `比 ${formatDateCn(weightSevenDaysAgo.logDate)} 的 ${formatKg(
        weightSevenDaysAgo.weightG,
      )} kg 轻了 ${formatKg(
        weightSevenDaysAgo.weightG - latestWeight.weightG,
      )} kg。`,
    });
  }

  if (latestVomit) {
    alerts.push({
      tone: 'gold',
      title: '最近有呕吐',
      detail: `最近一次在 ${formatDateCn(latestVomit.logDate)}。`,
    });
  }

  if (daysSinceLastLog === null) {
    alerts.push({
      tone: 'muted',
      title: '还没有记录',
      detail: '点「记一笔」记录今天的状态。',
    });
  } else if (daysSinceLastLog >= 2) {
    alerts.push({
      tone: 'muted',
      title: `已 ${daysSinceLastLog} 天没记录`,
      detail: '超过 48 小时没有打卡，记得补一条。',
    });
  }

  const metricCards = METRIC_CARDS.map((metric) => {
    const series = weekDates.map(
      (date) => getLog(date)?.[metric.key] ?? null,
    );
    const value = getLog(today)?.[metric.key] ?? null;
    const { trend, mean } = trendFor(value, series);

    return {
      ...metric,
      values: series,
      value,
      trend,
      mean,
      sparklineLabel: `近 7 天${metric.label}趋势：${series
        .map((item) => item ?? '未记录')
        .join('、')}`,
    };
  });

  const sexLabel =
    cat.sex === 'F' ? '母' : cat.sex === 'M' ? '公' : null;
  const ageLabel = formatAgeLabel(cat.birthEst, today);
  const subtitle =
    [sexLabel, ageLabel].filter(Boolean).join(' · ') || '年龄未知';

  const isolationDayNumber = inclusiveDayNumber(ISOLATION_START, today);
  const isolationLabel =
    isolationDayNumber >= 1 ? `隔离第 ${isolationDayNumber} 天` : null;

  const creatorLabel = todayStatus
    ? todayStatus.creatorName ?? todayStatus.creatorEmail ?? '家人'
    : null;
  const recordedTime = todayStatus
    ? formatTimeCn(todayStatus.createdAt)
    : null;

  const weightDiffTone =
    weightDiff === null || weightDiff === 0
      ? 'text-muted'
      : weightDiff > 0
        ? 'text-mint'
        : 'text-coral';

  const weightDiffLabel =
    latestWeight === null
      ? '暂无体重记录'
      : weightDiff === null
        ? '暂无上次体重对比'
        : weightDiff === 0
          ? '与上次体重持平'
          : `较上次${weightDiff > 0 ? '增加' : '减少'} ${formatKg(
              Math.abs(weightDiff),
            )} 千克`;

  const dueDays = nextDue
    ? daysBetween(today, nextDue.nextDue)
    : null;
  const dueLabel =
    dueDays === null
      ? ''
      : dueDays === 0
        ? '就是今天'
        : dueDays > 0
          ? `还有 ${dueDays} 天`
          : `已过期 ${Math.abs(dueDays)} 天`;
  const dueTone =
    dueDays !== null && dueDays < 0
      ? 'text-coral'
      : dueDays === 0
        ? 'text-gold-deep dark:text-gold'
        : 'text-ink dark:text-cream';

  return (
    <div className="pb-20">
      <TodayHeader today={today} userName={userName} />

      <div className="space-y-4">
        <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <div className="flex items-center gap-4">
            <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-gold/35 via-gold/15 to-cream ring-1 ring-ink/5 dark:from-gold/30 dark:via-gold/10 dark:to-white/5 dark:ring-white/10">
              {cat.avatarUrl ? (
                // 头像来自用户配置，可能是任意外链，这里用原生 img 避免域名白名单。
                <img
                  src={cat.avatarUrl}
                  alt={`${cat.name}的头像`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <CatAvatar />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold text-ink dark:text-cream">
                    {cat.name}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {subtitle}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-muted">最新体重</p>
                  {latestWeight ? (
                    <>
                      <p className="mt-0.5 whitespace-nowrap text-[22px] font-bold leading-tight text-ink tabular-nums dark:text-cream">
                        {formatKg(latestWeight.weightG)}
                        <span className="ml-0.5 text-[11px] font-medium text-muted">
                          kg
                        </span>
                      </p>
                      <p
                        aria-label={weightDiffLabel}
                        className={`mt-0.5 flex items-center justify-end gap-0.5 text-[11px] font-medium ${weightDiffTone}`}
                      >
                        {weightDiff === null ? (
                          '暂无对比'
                        ) : weightDiff === 0 ? (
                          '持平'
                        ) : (
                          <>
                            {weightDiff > 0 ? (
                              <ArrowUp size={12} aria-hidden="true" />
                            ) : (
                              <ArrowDown size={12} aria-hidden="true" />
                            )}
                            {formatKg(Math.abs(weightDiff))} kg
                          </>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 whitespace-nowrap text-sm text-muted">
                      暂无记录
                    </p>
                  )}
                </div>
              </div>

              {isolationLabel ? (
                <p className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold-deep dark:text-gold">
                  <span className="whitespace-nowrap">{isolationLabel}</span>
                  <span className="whitespace-nowrap text-gold-deep/70 dark:text-gold/70">
                    · 起始 {ISOLATION_START}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section
          className={`flex items-start gap-3 rounded-[20px] border px-4 py-3.5 ${
            todayStatus
              ? 'border-mint/25 bg-mint/10'
              : 'border-coral/25 bg-coral/10'
          }`}
        >
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              todayStatus
                ? 'bg-mint/15 text-mint'
                : 'bg-coral/15 text-coral'
            }`}
          >
            {todayStatus ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <CircleDashed size={18} aria-hidden="true" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p
                className={`text-sm font-semibold ${
                  todayStatus ? 'text-mint' : 'text-coral'
                }`}
              >
                {todayStatus
                  ? `已记录 · 记录人 ${creatorLabel}`
                  : '今天还没记'}
              </p>
              {recordedTime ? (
                <span className="shrink-0 text-[11px] text-mint/80">
                  {recordedTime}
                </span>
              ) : null}
            </div>
            {!todayStatus ? (
              <p className="mt-0.5 text-xs text-coral/80">
                点右下角「记一笔」，30 秒记完。
              </p>
            ) : null}
          </div>
        </section>

        {alerts.length > 0 ? (
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink dark:text-cream">
              <AlertTriangle
                size={15}
                className="text-coral"
                aria-hidden="true"
              />
              需要留意
            </h2>
            <div className="space-y-2">
              {alerts.map((alert) => {
                const tone = ALERT_STYLES[alert.tone];

                return (
                  <div
                    key={alert.title}
                    className={`flex items-start gap-2.5 rounded-[20px] border px-4 py-3 ${tone.container}`}
                  >
                    <AlertTriangle
                      size={16}
                      className={`mt-0.5 shrink-0 ${tone.icon}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${tone.title}`}>
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-muted">
                        {alert.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink dark:text-cream">
              近 7 天指标
            </h2>
            <span className="text-[11px] text-muted">今日数值</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {metricCards.map((metric) => {
              const Icon = metric.icon;
              const tone = metricTone(metric.key, metric.value);
              const trendLabel =
                metric.mean === null || metric.value === null
                  ? ''
                  : metric.trend === 'flat'
                    ? `与 7 天均值 ${metric.mean.toFixed(1)} 持平`
                    : `较 7 天均值 ${metric.mean.toFixed(1)} ${
                        metric.trend === 'up' ? '上升' : '下降'
                      }`;

              return (
                <div
                  key={metric.key}
                  className="min-w-0 rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
                    <Icon size={14} aria-hidden="true" />
                    <span>{metric.label}</span>
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-1">
                    <p
                      className={`text-[28px] font-bold leading-none tabular-nums ${tone}`}
                    >
                      {metric.value ?? '—'}
                    </p>
                    {metric.trend !== 'none' ? (
                      <span
                        aria-label={trendLabel}
                        className="flex items-center gap-0.5 text-[11px] text-muted"
                      >
                        <TrendIcon trend={metric.trend} />
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-[10px] text-muted">{metric.unit}</p>

                  <div className="mt-2">
                    <Sparkline
                      values={metric.values}
                      min={metric.min}
                      max={metric.max}
                      label={metric.sparklineLabel}
                    />
                  </div>

                  <p className="mt-1 text-[10px] text-muted">
                    近 7 天均{' '}
                    {metric.mean === null ? '—' : metric.mean.toFixed(1)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink dark:text-cream">
            待办倒计时
          </h2>

          {nextDue ? (
            <div className="flex items-center gap-4 rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-deep dark:text-gold">
                <CalendarClock size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-muted">
                  {RECORD_TYPE_LABELS[nextDue.type] ?? '提醒'} ·{' '}
                  {nextDue.name ?? '计划提醒'}
                </p>
                <p className={`mt-0.5 text-lg font-bold ${dueTone}`}>
                  {dueLabel}
                </p>
              </div>
              <p className="shrink-0 text-right text-[11px] leading-5 text-muted">
                {formatDateCn(nextDue.nextDue)}
                <br />
                到期
              </p>
            </div>
          ) : (
            <div className="rounded-[20px] bg-white p-5 text-sm leading-6 text-muted shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
              暂无待办。疫苗和驱虫的下次到期日会显示在这里。
            </div>
          )}
        </section>
      </div>

      <QuickLogSheet today={today} catName={cat.name} />
    </div>
  );
}
