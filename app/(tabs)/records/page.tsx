import { asc, desc, eq } from 'drizzle-orm';
import { Download } from 'lucide-react';
import CatEmpty from '@/components/CatEmpty';
import RecordsManager, {
  type RecordListItem,
} from '@/components/RecordsManager';
import { requireUser } from '@/lib/auth';
import { todayInShanghai } from '@/lib/dates';
import { db } from '@/lib/db';
import { catMembers, cats, records } from '@/lib/schema';

export const instant = false;

export default async function RecordsPage() {
  const user = await requireUser();
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
          <p className="text-sm text-muted">疫苗 · 驱虫 · 就诊 · 用药</p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight">记录</h1>
        </header>

        <section className="rounded-[20px] bg-white shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <CatEmpty
            title="还没有猫咪档案"
            hint="先在档案页建立煤球的基础信息，这里就能记录疫苗和驱虫了。"
          />
        </section>
      </div>
    );
  }

  const rows = await db
    .select({
      id: records.id,
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
    .where(eq(records.catId, cat.id))
    .orderBy(desc(records.eventDate), desc(records.createdAt));

  const items: RecordListItem[] = rows;

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

      <RecordsManager records={items} today={today} catName={cat.name} />
    </div>
  );
}
