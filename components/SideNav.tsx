'use client';

import { motion } from 'framer-motion';
import { BarChart3, Cat, ClipboardList, Home, Palette } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CatPortrait } from '@/components/CatEmpty';

const TABS = [
  { href: '/today', label: '今日', Icon: Home },
  { href: '/data', label: '数据', Icon: BarChart3 },
  { href: '/records', label: '记录', Icon: ClipboardList },
  { href: '/profile', label: '档案', Icon: Cat },
] as const;

/** PC 左侧固定导航：手机 / 平板通过 lg:flex + hidden 完全隐藏。 */
export default function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-ink/[0.07] bg-cream/95 px-4 py-6 backdrop-blur-md dark:border-white/10 dark:bg-night/95 lg:flex">
      <div className="flex items-center gap-3 px-2">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-gold/35 via-gold/15 to-cream ring-1 ring-ink/5 dark:from-gold/30 dark:via-gold/10 dark:to-white/5 dark:ring-white/10">
          <CatPortrait className="h-full w-full" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink dark:text-cream">
            煤球
          </p>
          <p className="truncate text-[11px] text-muted">健康记录</p>
        </div>
      </div>

      <nav aria-label="主导航" className="mt-7">
        <ul className="space-y-1">
          {TABS.map(({ href, label, Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);

            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex h-11 min-h-[44px] items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                    active
                      ? 'bg-gold/10 text-gold-deep dark:text-gold'
                      : 'text-muted hover:bg-ink/[0.04] hover:text-ink dark:hover:bg-white/[0.06] dark:hover:text-cream'
                  }`}
                >
                  {active ? (
                    <motion.span
                      layoutId="side-nav-indicator"
                      className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gold"
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 32,
                      }}
                    />
                  ) : null}

                  <Icon
                    aria-hidden="true"
                    size={20}
                    strokeWidth={active ? 2.4 : 1.8}
                    className={
                      active ? 'text-gold-deep dark:text-gold' : 'text-muted'
                    }
                  />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto border-t border-ink/[0.07] pt-4 dark:border-white/10">
        <Link
          href="/profile"
          className="flex h-11 min-h-[44px] items-center gap-3 rounded-2xl px-3 text-sm font-medium text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:hover:bg-white/[0.06] dark:hover:text-cream"
        >
          <Palette size={18} aria-hidden="true" />
          外观与主题
        </Link>
      </div>
    </aside>
  );
}
