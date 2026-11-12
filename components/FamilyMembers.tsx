'use client';

import {
  Check,
  Clock,
  Copy,
  UserMinus,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  createInvite,
  removeMember,
  revokeInvite,
} from '@/app/actions/family';

export type FamilyMember = {
  userId: string;
  displayName: string | null;
  email: string;
  role: string;
};

export type PendingInvite = {
  code: string;
  expiresAt: string;
};

type FamilyMembersProps = {
  members: FamilyMember[];
  initialInvites: PendingInvite[];
  isOwner: boolean;
  currentUserId: string;
};

function memberName(member: FamilyMember): string {
  return member.displayName?.trim() || member.email;
}

function initialOf(member: FamilyMember): string {
  return memberName(member).charAt(0).toUpperCase() || '?';
}

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function remainingLabel(expiresAt: string, now: number): string {
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) {
    return '已过期';
  }

  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 60) {
    return `还剩 ${minutes} 分钟`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `还剩 ${hours} 小时 ${rest} 分` : `还剩 ${hours} 小时`;
}

export default function FamilyMembers({
  members,
  initialInvites,
  isOwner,
  currentUserId,
}: FamilyMembersProps) {
  const [invites, setInvites] = useState(initialInvites);
  const [createdInvite, setCreatedInvite] = useState<PendingInvite | null>(
    null,
  );
  const [pendingCreate, setPendingCreate] = useState(false);
  const [revokingCode, setRevokingCode] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setInvites(initialInvites);
  }, [initialInvites]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const ownerCount = members.filter((member) => member.role === 'owner').length;
  const listedInvites = createdInvite
    ? invites.filter((invite) => invite.code !== createdInvite.code)
    : invites;

  async function handleCreateInvite() {
    if (pendingCreate) {
      return;
    }

    setPendingCreate(true);
    setError(null);

    try {
      const result = await createInvite();
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCreatedInvite({ code: result.code, expiresAt: result.expiresAt });
    } catch {
      setError('生成邀请码失败，请检查网络后重试');
    } finally {
      setPendingCreate(false);
    }
  }

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setError('复制失败，请长按邀请码手动复制');
    }
  }

  async function handleRevoke(code: string) {
    if (revokingCode) {
      return;
    }

    setRevokingCode(code);
    setError(null);

    try {
      const result = await revokeInvite(code);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setInvites((current) => current.filter((invite) => invite.code !== code));
      setCreatedInvite((current) =>
        current?.code === code ? null : current,
      );
    } catch {
      setError('作废失败，请检查网络后重试');
    } finally {
      setRevokingCode(null);
    }
  }

  async function handleRemove(member: FamilyMember) {
    if (removingId) {
      return;
    }

    if (!window.confirm(`把 ${memberName(member)} 移出家庭？`)) {
      return;
    }

    setRemovingId(member.userId);
    setError(null);

    try {
      const result = await removeMember(member.userId);
      if (!result.ok) {
        setError(result.error);
      }
    } catch {
      setError('移除失败，请检查网络后重试');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-cream">
        <UsersRound
          size={15}
          className="text-gold-deep dark:text-gold"
          aria-hidden="true"
        />
        家庭成员
      </h2>

      <ul className="mt-3 space-y-2">
        {members.map((member) => {
          const canRemove =
            isOwner &&
            member.userId !== currentUserId &&
            !(member.role === 'owner' && ownerCount <= 1);

          return (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded-2xl bg-ink/[0.035] p-3 dark:bg-white/[0.04]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-deep dark:text-gold">
                {initialOf(member)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink dark:text-cream">
                  {memberName(member)}
                  {member.userId === currentUserId ? (
                    <span className="ml-1 text-[11px] font-normal text-muted">
                      （你）
                    </span>
                  ) : null}
                </p>
                {member.displayName ? (
                  <p className="truncate text-[11px] text-muted">
                    {member.email}
                  </p>
                ) : null}
              </div>

              <span className="shrink-0 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10px] font-medium text-muted dark:bg-white/[0.08]">
                {member.role === 'owner' ? '创建者' : '家人'}
              </span>

              {canRemove ? (
                <button
                  type="button"
                  onClick={() => handleRemove(member)}
                  disabled={removingId === member.userId}
                  aria-label={`移除 ${memberName(member)}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-coral/10 hover:text-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UserMinus size={16} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {isOwner ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleCreateInvite}
            disabled={pendingCreate}
            className="flex h-11 min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl bg-gold text-sm font-semibold text-ink transition-colors hover:bg-gold-deep active:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UserPlus size={16} aria-hidden="true" />
            {pendingCreate ? '生成中…' : '邀请家人'}
          </button>
          <p className="mt-1.5 text-center text-[10px] text-muted">
            邀请码 24 小时内有效，只能使用一次
          </p>
        </div>
      ) : null}

      {createdInvite ? (
        <div className="mt-3 rounded-2xl border border-gold/30 bg-gold/10 p-4">
          <p className="text-[10px] font-medium text-muted">邀请码</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-mono text-xl font-bold tracking-[0.22em] text-ink dark:text-cream">
              {createdInvite.code}
            </span>
            <button
              type="button"
              onClick={() => handleCopy(createdInvite.code)}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-gold/40 px-3 text-xs font-semibold text-gold-deep transition-colors hover:bg-gold/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:text-gold"
            >
              {copiedCode === createdInvite.code ? (
                <>
                  <Check size={14} aria-hidden="true" />
                  已复制
                </>
              ) : (
                <>
                  <Copy size={14} aria-hidden="true" />
                  复制邀请码
                </>
              )}
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
            <Clock size={11} aria-hidden="true" />
            {formatExpiry(createdInvite.expiresAt)} 到期
            {now !== null
              ? ` · ${remainingLabel(createdInvite.expiresAt, now)}`
              : ''}
          </p>
        </div>
      ) : null}

      {isOwner && listedInvites.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[11px] font-semibold text-muted">
            未使用的邀请码
          </h3>
          <ul className="mt-2 space-y-1.5">
            {listedInvites.map((invite) => (
              <li
                key={invite.code}
                className="flex items-center gap-2 rounded-2xl bg-ink/[0.035] px-3 py-2 dark:bg-white/[0.04]"
              >
                <span className="font-mono text-sm font-semibold tracking-[0.18em] text-ink dark:text-cream">
                  {invite.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-muted">
                  {now !== null
                    ? remainingLabel(invite.expiresAt, now)
                    : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(invite.code)}
                  aria-label={`复制邀请码 ${invite.code}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-gold/15 hover:text-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:hover:text-gold"
                >
                  {copiedCode === invite.code ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleRevoke(invite.code)}
                  disabled={revokingCode === invite.code}
                  className="flex h-9 shrink-0 items-center rounded-full px-2 text-[10px] font-semibold text-coral transition-colors hover:bg-coral/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {revokingCode === invite.code ? '作废中…' : '作废'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-coral">
          {error}
        </p>
      ) : null}
    </section>
  );
}
