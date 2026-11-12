import { ArrowRight, Cat, KeyRound } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { createCat } from '@/app/actions/cat';
import { redeemInvite } from '@/app/actions/family';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { catMembers } from '@/lib/schema';

export const instant = false;

const INPUT_CLASS =
  'h-12 w-full rounded-2xl border border-ink/10 bg-cream/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/15 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30';

const LABEL_CLASS = 'mb-1.5 block text-xs font-semibold text-ink dark:text-cream';

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();

  const [membership] = await db
    .select({ catId: catMembers.catId })
    .from(catMembers)
    .where(eq(catMembers.userId, user.id))
    .limit(1);

  if (membership) {
    redirect('/today');
  }

  const { error } = await searchParams;
  const greeting = user.displayName ?? user.email;

  async function handleCreateCat(formData: FormData) {
    'use server';

    const result = await createCat(formData);
    if (!result.ok) {
      redirect(`/welcome?error=${encodeURIComponent(result.error)}`);
    }

    redirect('/today');
  }

  async function handleRedeemInvite(formData: FormData) {
    'use server';

    const result = await redeemInvite(formData);
    if (!result.ok) {
      redirect(`/welcome?error=${encodeURIComponent(result.error)}`);
    }

    redirect('/today');
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-5 py-10">
      <header>
        <p className="text-sm text-muted">你好，{greeting}</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">
          从哪只猫开始？
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          新家长可以从零建立档案；家人拿到邀请码后，就能一起记录同一只猫。
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-2xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-deep dark:text-gold">
              <Cat size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-ink dark:text-cream">
                我是新家长
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                创建一只属于你的宠物档案，你会成为创建者。
              </p>
            </div>
          </div>

          <form action={handleCreateCat} className="mt-4 space-y-3">
            <label className="block">
              <span className={LABEL_CLASS}>宠物名字</span>
              <input
                type="text"
                name="name"
                required
                maxLength={20}
                placeholder="比如：煤球"
                className={INPUT_CLASS}
              />
            </label>

            <label className="block">
              <span className={LABEL_CLASS}>
                出生日期 <span className="text-muted">（可空）</span>
              </span>
              <input type="date" name="birth_est" className={INPUT_CLASS} />
            </label>

            <button
              type="submit"
              className="flex h-12 min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl bg-gold text-[15px] font-semibold text-ink transition-colors hover:bg-gold-deep active:bg-gold-deep"
            >
              创建档案
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>
        </section>

        <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint/15 text-mint">
              <KeyRound size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-ink dark:text-cream">
                我有邀请码
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                输入家人给你的 8 位邀请码，加入同一个家庭。
              </p>
            </div>
          </div>

          <form action={handleRedeemInvite} className="mt-4 space-y-3">
            <label className="block">
              <span className={LABEL_CLASS}>邀请码</span>
              <input
                type="text"
                name="code"
                required
                maxLength={8}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCD2345"
                className={`${INPUT_CLASS} uppercase tracking-[0.3em]`}
              />
            </label>

            <button
              type="submit"
              className="flex h-12 min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl border border-ink/10 bg-white text-[15px] font-semibold text-ink transition-colors hover:bg-ink/[0.04] dark:border-white/15 dark:bg-white/[0.04] dark:text-cream dark:hover:bg-white/[0.08]"
            >
              加入家庭
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
