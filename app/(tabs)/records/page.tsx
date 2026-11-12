import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import { Download } from 'lucide-react';
import RecordsManager, {
  type RecordListItem,
} from '@/components/RecordsManager';
import ShareLinkCard from '@/components/ShareLinkCard';
import { requireCurrentCat } from '@/lib/current-cat';
import { todayInShanghai } from '@/lib/dates';
import { db } from '@/lib/db';
import { dailyLogs, records, shareLinks, users } from '@/lib/schema';

export const instant = false;

export default async function RecordsPage() {
  const { cat } = await requireCurrentCat();
  const today = todayInShanghai();

  const rows = await db
    .select({
      id: records.id,
      type: records.type,
      name: records.name,
      eventDate: records.eventDate,
      dose: records.dose,
      drugName: records.drugName,
      doseMg: records.doseMg,
      weightG: records.weightG,
      photoPath: records.photoPath,
      nextDue: records.nextDue,
      cost: records.cost,
      vet: records.vet,
      note: records.note,
      recorderDisplayName: users.displayName,
      recorderEmail: users.email,
    })
    .from(records)
    .leftJoin(users, eq(users.id, records.createdBy))
    .where(eq(records.catId, cat.id))
    .orderBy(desc(records.eventDate), desc(records.createdAt));

  const [latestWeight] = await db
    .select({ weightG: dailyLogs.weightG })
    .from(dailyLogs)
    .where(
      and(eq(dailyLogs.catId, cat.id), isNotNull(dailyLogs.weightG)),
    )
    .orderBy(desc(dailyLogs.logDate))
    .limit(1);

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

  const items: RecordListItem[] = rows.map(
    ({ recorderDisplayName, recorderEmail, ...record }) => ({
      ...record,
      recorderName:
        recorderDisplayName?.trim() ||
        recorderEmail?.split('@')[0] ||
        null,
    }),
  );

  return (
    <div className="pb-6">
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">疫苗 · 驱虫 · 就诊 · 用药</p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight">记录</h1>
          </div>

          <a
            href="/api/export?type=records&from=2000-01-01&to=2999-12-31"
            className="inline-flex h-11 min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-gold/15 px-3.5 text-xs font-semibold text-gold-deep transition-colors hover:bg-gold/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:text-gold"
          >
            <Download size={15} aria-hidden="true" />
            导出 CSV
          </a>
        </div>

        <p className="mt-1.5 text-xs text-muted">
          {cat.name} · 共 {items.length} 条健康记录
        </p>
      </header>

      <div className="mb-4">
        <ShareLinkCard catId={cat.id} initialLinks={activeShareLinks} />
      </div>

      <RecordsManager
        records={items}
        today={today}
        catName={cat.name}
        latestWeightG={latestWeight?.weightG ?? null}
      />
    </div>
  );
}
