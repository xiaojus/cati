import { and, asc, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import {
  Cat,
  ChevronDown,
  ChevronRight,
  HardDrive,
  History,
  Settings2,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createCat } from '@/app/actions/cat';
import { CatPortrait } from '@/components/CatEmpty';
import { PetSwitchButton } from '@/components/CatSwitcher';
import CatProfileForm from '@/components/CatProfileForm';
import FamilyMembers from '@/components/FamilyMembers';
import HospitalCard from '@/components/HospitalCard';
import LogoutButton from '@/components/LogoutButton';
import ShareLinkCard from '@/components/ShareLinkCard';
import { getHospitalInfo, getIsolationStart } from '@/lib/app-settings';
import { requireUser } from '@/lib/auth';
import { requireCurrentCat } from '@/lib/current-cat';
import {
  SHANGHAI_TIME_ZONE,
  formatAgeLabel,
  formatDateCn,
  inclusiveDayNumber,
  todayInShanghai,
} from '@/lib/dates';
import { db, dbPath } from '@/lib/db';
import { EMPTY_HOSPITAL } from '@/lib/hospital';
import { catMembers, invites, records, shareLinks, users } from '@/lib/schema';

export const instant = false;

/** T4 任务卡规定的固定隔离起始日。 */
const ISOLATION_START = '2026-11-11';

/** 添加新宠物：createCat 会写入 owner 关系并自动切到新猫。 */
async function addPetAction(formData: FormData) {
  'use server';

  const result = await createCat(formData);
  if (!result.ok) {
    redirect(`/profile?petError=${encodeURIComponent(result.error)}`);
  }

  redirect('/today');
}

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

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ petError?: string }>;
}) {
  const user = await requireUser();
  const { cat, role, memberships } = await requireCurrentCat();
  const { petError } = await searchParams;
  const today = todayInShanghai();

  const savedHospital = getHospitalInfo(cat.id);
  const [latestVet] = await db
    .select({ vet: records.vet })
    .from(records)
    .where(and(eq(records.catId, cat.id), isNotNull(records.vet)))
    .orderBy(desc(records.eventDate))
    .limit(1);

  const hospital = {
    ...savedHospital,
    name: savedHospital.name || latestVet?.vet || '',
  };

  const members = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      role: catMembers.role,
    })
    .from(catMembers)
    .innerJoin(users, eq(users.id, catMembers.userId))
    .where(eq(catMembers.catId, cat.id))
    .orderBy(asc(users.createdAt));

  const pendingInvites =
    role === 'owner'
      ? await db
          .select({ code: invites.code, expiresAt: invites.expiresAt })
          .from(invites)
          .where(and(eq(invites.catId, cat.id), isNull(invites.usedBy)))
          .orderBy(desc(invites.createdAt))
      : [];

  const activeShareLinks = await db
    .select({
      token: shareLinks.token,
      expiresAt: shareLinks.expiresAt,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.catId, cat.id),
        isNull(shareLinks.revokedAt),
        gt(shareLinks.expiresAt, new Date().toISOString()),
      ),
    )
    .orderBy(desc(shareLinks.createdAt));

  const sexLabel = cat.sex === 'F' ? '母' : cat.sex === 'M' ? '公' : '未知';
  const ageLabel = formatAgeLabel(cat.birthEst, today);
  const neuteredLabel =
    cat.neutered === 1
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

      {petError ? (
        <p
          role="alert"
          className="mb-4 rounded-2xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral"
        >
          {petError}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="min-w-0 space-y-4">
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

                {role === 'owner' ? (
                  <CatProfileForm
                    name={cat.name}
                    birthEst={cat.birthEst}
                    sex={cat.sex}
                    neutered={cat.neutered}
                    neuteredAt={cat.neuteredAt}
                    isolationStart={getIsolationStart(cat.id)}
                    note={cat.note}
                  />
                ) : null}
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

          <section
            id="pets"
            className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-cream">
              <Cat
                size={15}
                className="text-gold-deep dark:text-gold"
                aria-hidden="true"
              />
              我的宠物
            </h2>

            <ul className="mt-3 space-y-2">
              {memberships.map((membership) => {
                const pet = membership.cat;
                const current = pet.id === cat.id;

                return (
                  <li
                    key={pet.id}
                    className="flex items-center gap-3 rounded-2xl bg-ink/[0.035] p-3 dark:bg-white/[0.04]"
                  >
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-gold/35 via-gold/15 to-cream ring-1 ring-ink/5 dark:from-gold/30 dark:via-gold/10 dark:to-white/5 dark:ring-white/10">
                      {pet.avatarUrl ? (
                        // 头像来自用户配置，可能是任意外链，这里用原生 img 避免域名白名单。
                        <img
                          src={pet.avatarUrl}
                          alt={`${pet.name}的头像`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <CatPortrait className="h-full w-full" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink dark:text-cream">
                        {pet.name}
                        {current ? (
                          <span className="ml-1 text-[11px] font-normal text-muted">
                            （当前）
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-muted">
                        {membership.role === 'owner' ? '创建者' : '家人'}
                      </p>
                    </div>

                    {current ? (
                      <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold-deep dark:text-gold">
                        当前
                      </span>
                    ) : (
                      <PetSwitchButton catId={pet.id} catName={pet.name} />
                    )}
                  </li>
                );
              })}
            </ul>

            <form
              action={addPetAction}
              className="mt-4 space-y-3 border-t border-ink/[0.06] pt-4 dark:border-white/10"
            >
              <h3 className="text-xs font-semibold text-ink dark:text-cream">
                添加另一只宠物
              </h3>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium text-muted">
                  名字
                </span>
                <input
                  type="text"
                  name="name"
                  required
                  maxLength={20}
                  placeholder="比如：年糕"
                  className="h-12 w-full rounded-2xl border border-ink/10 bg-white/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium text-muted">
                  出生日期（可空）
                </span>
                <input
                  type="date"
                  name="birth_est"
                  className="h-12 w-full rounded-2xl border border-ink/10 bg-white/60 px-4 text-[15px] text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream"
                />
              </label>

              <button
                type="submit"
                className="flex h-11 min-h-[44px] w-full items-center justify-center rounded-2xl bg-gold text-sm font-semibold text-ink transition-colors hover:bg-gold-deep active:bg-gold-deep"
              >
                添加宠物
              </button>
            </form>
          </section>

          <FamilyMembers
            members={members}
            initialInvites={pendingInvites}
            isOwner={role === 'owner'}
            currentUserId={user.id}
          />

          <HospitalCard catId={cat.id} initial={hospital} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <ShareLinkCard catId={cat.id} initialLinks={activeShareLinks} />

          <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06] md:order-2">
            <Link
              href="/settings"
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-deep dark:text-gold">
                  <Settings2 size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink dark:text-cream">
                    设置
                  </span>
                  <span className="block text-[11px] text-muted">
                    AI 解析密钥 · 外观与主题
                  </span>
                </span>
              </span>
              <ChevronRight
                size={16}
                className="shrink-0 text-muted"
                aria-hidden="true"
              />
            </Link>
          </section>

          <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06] md:order-1">
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

          <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06] md:order-3">
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

          <details className="group rounded-[20px] bg-white shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06] md:order-4">
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
    </div>
  );
}
