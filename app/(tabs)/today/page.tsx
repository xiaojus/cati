import { requireUser } from '@/lib/auth';

// cacheComponents 下顶层读取 cookies() 会阻塞预渲染，这里显式允许阻塞。
export const instant = false;

export default async function TodayPage() {
  const user = await requireUser();

  return (
    <section>
      <header className="mb-6">
        <p className="text-sm text-muted">
          你好，{user.displayName ?? user.email}
        </p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">今日</h1>
      </header>

      <div className="rounded-[20px] bg-white p-6 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
        <span className="inline-flex items-center gap-2 rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold text-gold-deep dark:text-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          施工中
        </span>
        <h2 className="mt-4 text-lg font-semibold">今日监控面板</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          食欲、体重、精神与异常提醒正在搭建，很快就能在这里看到煤球的最新状态。
        </p>
      </div>
    </section>
  );
}
