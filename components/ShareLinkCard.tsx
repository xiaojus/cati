'use client';

import {
  Ban,
  Check,
  Copy,
  Link2,
  Share2,
  Stethoscope,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  createShareLink,
  revokeShareLink,
  type ShareLinkSummary,
} from '@/app/actions/share';
import { formatDateCn } from '@/lib/dates';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GOLD = '#F5B731';
const MUTED = '#8B8578';
const GRID = 'rgba(139,133,120,0.18)';

export type ShareWeightPoint = {
  date: string;
  weightKg: number | null;
};

type ShareLinkCardProps = {
  catId: string;
  initialLinks: ShareLinkSummary[];
};

function remainingDaysLabel(expiresAt: string, now: number): string {
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) {
    return '已失效';
  }

  return `${Math.max(1, Math.ceil(remaining / MS_PER_DAY))} 天后失效`;
}

function shareUrlFor(origin: string, token: string): string {
  return origin ? `${origin}/share/${token}` : `/share/${token}`;
}

function shortDate(value: string): string {
  const parts = value.split('-');
  return parts.length === 3
    ? `${Number(parts[1])}/${Number(parts[2])}`
    : value;
}

function weightDomain(points: ShareWeightPoint[]): [number, number] {
  const weights = points.flatMap((point) =>
    point.weightKg === null ? [] : [point.weightKg],
  );

  if (weights.length === 0) {
    return [0, 5];
  }

  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const pad = Math.max(0.1, (max - min) * 0.15);

  return [
    Math.floor((min - pad) * 10) / 10,
    Math.ceil((max + pad) * 10) / 10,
  ];
}

/**
 * 分享页专用的体重折线图。固定 160px 高，只读。
 * 和 ShareLinkCard 放在同一客户端模块里，避免为分享页新增组件文件。
 */
export function ShareWeightChart({ points }: { points: ShareWeightPoint[] }) {
  const hasData = points.some((point) => point.weightKg !== null);

  if (!hasData) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-2xl bg-ink/[0.03] text-xs text-muted dark:bg-white/[0.04]">
        暂无体重记录
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label="最近 7 天体重趋势折线图"
      className="h-[160px] w-full min-w-0 overflow-hidden"
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        initialDimension={{ width: 320, height: 160 }}
      >
        <LineChart
          data={points}
          margin={{ top: 8, right: 10, bottom: 0, left: -10 }}
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            minTickGap={18}
            interval="preserveStartEnd"
            tick={{ fill: MUTED, fontSize: 10 }}
            axisLine={{ stroke: GRID }}
            tickLine={false}
          />
          <YAxis
            domain={weightDomain(points)}
            width={38}
            tickFormatter={(value) => Number(value).toFixed(1)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: MUTED, fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFF9F0',
              border: '1px solid rgba(23,21,26,0.08)',
              borderRadius: 12,
              boxShadow: '0 8px 24px rgba(23,21,26,0.12)',
              fontSize: 12,
              padding: '8px 10px',
            }}
            labelStyle={{ color: '#17151A', fontWeight: 600, marginBottom: 2 }}
            itemStyle={{ color: '#17151A', fontSize: 12 }}
            labelFormatter={(label) => formatDateCn(String(label))}
            formatter={(value) => [`${Number(value).toFixed(2)} kg`, '体重']}
          />
          <Line
            type="monotone"
            dataKey="weightKg"
            name="体重"
            stroke={GOLD}
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: GOLD, strokeWidth: 0 }}
            activeDot={{ r: 4.5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * 记录页 / 档案页的分享入口：生成 7 天只读链接，并列出、作废有效链接。
 * 完整 URL 在浏览器端用 window.location.origin 拼出来，避免服务端猜 host。
 */
export default function ShareLinkCard({
  catId,
  initialLinks,
}: ShareLinkCardProps) {
  const [links, setLinks] = useState(initialLinks);
  const [origin, setOrigin] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setLinks(initialLinks);
  }, [initialLinks]);

  useEffect(() => {
    setOrigin(window.location.origin);
    setNow(Date.now());

    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleCreate() {
    if (pendingCreate) {
      return;
    }

    setPendingCreate(true);
    setError(null);

    try {
      const result = await createShareLink(catId);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setLinks((current) => [
        {
          token: result.token,
          expiresAt: result.expiresAt,
          createdAt: result.createdAt,
        },
        ...current,
      ]);
      setCreatedToken(result.token);
    } catch {
      setError('生成分享链接失败，请检查网络后重试');
    } finally {
      setPendingCreate(false);
    }
  }

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrlFor(origin, token));
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      setError('复制失败，请长按链接手动复制');
    }
  }

  async function handleRevoke(token: string) {
    if (revokingToken) {
      return;
    }

    setRevokingToken(token);
    setError(null);

    try {
      const result = await revokeShareLink(token);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setLinks((current) => current.filter((link) => link.token !== token));
      setCreatedToken((current) => (current === token ? null : current));
    } catch {
      setError('作废失败，请检查网络后重试');
    } finally {
      setRevokingToken(null);
    }
  }

  const createdLink = links.find((link) => link.token === createdToken) ?? null;
  const listedLinks = createdLink
    ? links.filter((link) => link.token !== createdLink.token)
    : links;

  return (
    <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-cream">
            <Stethoscope
              size={15}
              className="text-gold-deep dark:text-gold"
              aria-hidden="true"
            />
            只读分享
          </h2>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            给兽医看最近 7 天的记录，链接 7 天后自动失效。
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={pendingCreate}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-gold px-3.5 text-xs font-semibold text-ink transition-colors hover:bg-gold-deep active:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Share2 size={15} aria-hidden="true" />
          {pendingCreate ? '生成中…' : '给兽医看最近一周'}
        </button>
      </div>

      {createdLink ? (
        <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 p-4">
          <p className="flex items-center gap-1 text-[10px] font-medium text-muted">
            <Link2 size={11} aria-hidden="true" />
            把完整链接发给兽医
          </p>
          <p className="mt-1 break-all font-mono text-[11px] leading-5 text-ink dark:text-cream">
            {shareUrlFor(origin, createdLink.token)}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted">
              {now === null
                ? '7 天后失效'
                : remainingDaysLabel(createdLink.expiresAt, now)}
            </span>
            <button
              type="button"
              onClick={() => handleCopy(createdLink.token)}
              className="inline-flex h-11 min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-gold/40 px-3 text-xs font-semibold text-gold-deep transition-colors hover:bg-gold/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:text-gold"
            >
              {copiedToken === createdLink.token ? (
                <>
                  <Check size={14} aria-hidden="true" />
                  已复制
                </>
              ) : (
                <>
                  <Copy size={14} aria-hidden="true" />
                  复制链接
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {listedLinks.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[11px] font-semibold text-muted">
            有效链接
          </h3>
          <ul className="mt-2 space-y-1.5">
            {listedLinks.map((link) => (
              <li
                key={link.token}
                className="flex items-center gap-2 rounded-2xl bg-ink/[0.035] px-3 py-2 dark:bg-white/[0.04]"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink dark:text-cream">
                  {shareUrlFor(origin, link.token)}
                </span>
                <span className="shrink-0 text-[10px] text-muted">
                  {now === null
                    ? '—'
                    : remainingDaysLabel(link.expiresAt, now)}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(link.token)}
                  aria-label={`复制分享链接 ${link.token}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-gold/15 hover:text-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:hover:text-gold"
                >
                  {copiedToken === link.token ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleRevoke(link.token)}
                  disabled={revokingToken === link.token}
                  className="inline-flex h-9 min-h-[44px] shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold text-coral transition-colors hover:bg-coral/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Ban size={12} aria-hidden="true" />
                  {revokingToken === link.token ? '作废中…' : '作废'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : !createdLink ? (
        <p className="mt-3 text-[11px] text-muted">还没有生成过有效链接。</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-coral">
          {error}
        </p>
      ) : null}
    </section>
  );
}
