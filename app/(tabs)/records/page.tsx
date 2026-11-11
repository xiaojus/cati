import { requireUser } from '@/lib/auth';

export const instant = false;

export default async function RecordsPage() {
  await requireUser();

  return (
    <section>
      <header className="mb-6">
        <p className="text-sm text-muted">疫苗 · 驱虫 · 就诊 · 用药</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">记录</h1>
      </header>

      <div className="rounded-[20px] bg-white p-6 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
        <span className="inline-flex items-center gap-2 rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold text-gold-deep dark:text-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          施工中
        </span>
        <h2 className="mt-4 text-lg font-semibold">健康记录</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          疫苗、驱虫、就诊与用药的录入和倒计时正在施工。
        </p>
      </div>
    </section>
  );
}
