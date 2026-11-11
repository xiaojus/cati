import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import {
  ChevronDown,
  HardDrive,
  History,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import CatEmpty, { CatPortrait } from '@/components/CatEmpty';
import HospitalCard from '@/components/HospitalCard';
import LogoutButton from '@/components/LogoutButton';
import { getHospitalInfo } from '@/lib/app-settings';
import { requireUser } from '@/lib/auth';
import {
  SHANGHAI_TIME_ZONE,
  formatAgeLabel,
  formatDateCn,
  inclusiveDayNumber,
  todayInShanghai,
} from '@/lib/dates';
import { db, dbPath } from '@/lib/db';
import { EMPTY_HOSPITAL } from '@/lib/hospital';
import { catMembers, cats, records } from '@/lib/schema';

export const instant = false;

/** T4 任务卡规定的固定隔离起始日。 */
const ISOLATION_START = '2026-11-11';

const DANGER_SIGNALS = [
  {
    title: '不吃饭超 24 小时',
    detail: '完全不吃不喝，或超过 24 小时没有进食',
  },
  {
    title: '尿不出',
    detail: '猫砂盆超过 24 小时无尿，公猫尿闭是急症',
  },
  {
    title: '呼吸急促',
    detail: '张口呼吸、腹部起伏明显，或呼吸声变粗',
  },
  {
    title: '抽搐',
    detail: '全身抽搐、意识丧失，或持续流口水',
  },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatBackupTime(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function readDbInfo(): { size: string; backup: string } {
  try {
    const stat = statSync(dbPath);
    const backupDir = join(dirname(dbPath), 'backup');
    let latestBackup: Date | null = null;

    try {
      for (const name of readdirSync(backupDir)) {
        const fileStat = statSync(join(backupDir, name));
        if (
          fileStat.isFile() &&
          (latestBackup === null || fileStat.mtime > latestBackup)
        ) {
          latestBackup = fileStat.mtime;
        }
      }
    } catch {
      // 还没有备份目录时只显示「—」。
    }

    return {
      size: formatBytes(stat.size),
      backup: latestBackup ? formatBackupTime(latestBackup) : '—',
    };
  } catch {
    return { size: '—', backup: '—' };
  }
}

export default async function ProfilePage() {
  const user = await requireUser();
  const today = todayInShanghai();

  const [cat] = await db
    .select({
      id: cats.id,
      name: cats.name,
      birthEst: cats.birthEst,
      sex: cats.sex,
      neutered: cats.neutered,
      neuteredAt: cats.neuteredAt,
      avatarUrl: cats.avatarUrl,
      note: cats.note,
    })
    .from(catMembers)
    .innerJoin(cats, eq(cats.id, catMembers.catId))
    .where(eq(catMembers.userId, user.id))
    .orderBy(asc(catMembers.catId))
    .limit(1);

  let hospital = { ...EMPTY_HOSPITAL };

  if (cat) {
    const saved = getHospitalInfo(cat.id);
    const [latestVet] = await db
      .select({ vet: records.vet })
      .from(records)
      .where(and(eq(records.catId, cat.id), isNotNull(records.vet)))
      .orderBy(desc(records.eventDate))
      .limit(1);

    hospital = {
      ...saved,
      name: saved.name || latestVet?.vet || '',
    };
  }

  const sexLabel =
    cat?.sex === 'F' ? '母' : cat?.sex === 'M' ? '公' : '未知';
  const ageLabel = cat ? formatAgeLabel(cat.birthEst, today) : null;
  const neuteredLabel = !cat
    ? '—'
    : cat.neutered === 1
      ? cat.neuteredAt
        ? `已绝育 · ${formatDateCn(cat.neuteredAt)}`
        : '已绝育'
      : '待手术';

  const isolationDay = inclusiveDayNumber(ISOLATION_START, today);
  const isolationLabel =
    isolationDay >= 1 ? `第 ${isolationDay} 天` : '未开始';
  const dbInfo = readDbInfo();
  const displayName = user.displayName ?? '煤球家长';

  return (
    <div className="pb-6">
      <header className="mb-5">
        <p className="text-sm text-muted">猫咪档案与设置</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">档案</h1>
      </header>

      <div className="space-y-4">
        {cat ? (
          <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
            <div className="flex items-center gap-4">
              <div className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-gold/35 via-gold/15 to-cream ring-1 ring-ink/5 dark:from-gold/30 dark:via-gold/10 dark:to-white/5 dark:ring-white/10">
                {cat.avatarUrl ? (
                  // 头像来自用户配置，可能是任意外链，这里用原生 img 避免域名白名单。
                  <img
                    src={cat.avatarUrl}
                    alt={`${cat.name}的头像`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <CatPortrait className="h-full w-full" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-bold text-ink dark:text-cream">
                  {cat.name}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {sexLabel}
                  {ageLabel ? ` · ${ageLabel}` : ''}
                </p>
                <p className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold-deep dark:text-gold">
                  <span className="whitespace-nowrap">
                    隔离{isolationLabel}
                  </span>
                  <span className="whitespace-nowrap text-gold-deep/70 dark:text-gold/70">
                    · 起始 {formatDateCn(ISOLATION_START)}
                  </span>
                </p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="min-w-0 rounded-2xl bg-ink/[0.035] p-3 dark:bg-white/[0.04]">
                <dt className="text-[10px] font-medium text-muted">性别</dt>
                <dd className="mt-1 text-sm font-semibold text-ink dark:text-cream">
                  {sexLabel}
                </dd>
              </div>

              <div className="min-w-0 rounded-2xl bg-ink/[0.035] p-3 dark:bg-white/[0.04]">
                <dt className="text-[10px] font-medium text-muted">约年龄</dt>
                <dd className="mt-1 text-sm font-semibold text-ink dark:text-cream">
                  {ageLabel ?? '未知'}
                </dd>
              </div>

              <div className="min-w-0 rounded-2xl bg-ink/[0.035] p-3 dark:bg-white/[0.04]">
                <dt className="text-[10px] font-medium text-muted">绝育</dt>
                <dd className="mt-1 text-sm font-semibold leading-5 text-ink dark:text-cream">
                  {neuteredLabel}
                </dd>
              </div>

              <div className="min-w-0 rounded-2xl bg-ink/[0.035] p-3 dark:bg-white/[0.04]">
                <dt className="text-[10px] font-medium text-muted">隔离</dt>
                <dd className="mt-1 text-sm font-semibold text-ink dark:text-cream">
                  {isolationLabel}
                </dd>
                <dd className="mt-0.5 text-[10px] text-muted">
                  起始 {formatDateCn(ISOLATION_START)}
                </dd>
              </div>
            </dl>

            {cat.note ? (
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted">
                {cat.note}
              </p>
            ) : null}
          </section>
        ) : (
          <section className="rounded-[20px] bg-white shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
            <CatEmpty
              title="还没有猫咪档案"
              hint="数据库里还没有煤球的信息，先运行初始化脚本建立档案。"
            />
          </section>
        )}

        {cat ? <HospitalCard catId={cat.id} initial={hospital} /> : null}

        <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-cream">
            <UserRound
              size={15}
              className="text-gold-deep dark:text-gold"
              aria-hidden="true"
            />
            账号
          </h2>

          <div className="mt-3 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-deep dark:text-gold">
              <UserRound size={20} aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink dark:text-cream">
                {displayName}
              </p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>

            <LogoutButton />
          </div>
        </section>

        <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-cream">
            <HardDrive
              size={15}
              className="text-gold-deep dark:text-gold"
              aria-hidden="true"
            />
            数据
          </h2>

          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-2xl bg-ink/[0.035] p-3 dark:bg-white/[0.04]">
              <dt className="text-[10px] font-medium text-muted">数据库大小</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-ink dark:text-cream">
                {dbInfo.size}
              </dd>
            </div>

            <div className="min-w-0 rounded-2xl bg-ink/[0.035] p-3 dark:bg-white/[0.04]">
              <dt className="flex items-center gap-1 text-[10px] font-medium text-muted">
                <History size={11} aria-hidden="true" />
                最近备份
              </dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-ink dark:text-cream">
                {dbInfo.backup}
              </dd>
            </div>
          </dl>

          <p className="mt-2 text-[10px] text-muted">数据库：data/cat.db</p>
        </section>

        <details className="group rounded-[20px] bg-white shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-cream">
              <ShieldAlert
                size={16}
                className="text-coral"
                aria-hidden="true"
              />
              危险信号速查
            </span>
            <ChevronDown
              size={16}
              className="shrink-0 text-muted transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>

          <div className="border-t border-ink/[0.06] px-5 pb-5 pt-3 dark:border-white/10">
            <ul className="space-y-2">
              {DANGER_SIGNALS.map((signal) => (
                <li key={signal.title} className="flex gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-coral"
                  />
                  <span className="min-w-0 leading-6">
                    <strong className="font-semibold text-ink dark:text-cream">
                      {signal.title}
                    </strong>
                    <span className="text-muted"> — {signal.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-3 rounded-xl bg-coral/10 px-3 py-2 text-xs font-semibold text-coral">
              出现以上任一情况，立即就医，不要在家观察。
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
