'use client';

import { motion } from 'framer-motion';
import { BarChart3, Cat, ClipboardList, Home } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/today', label: '今日', Icon: Home },
  { href: '/data', label: '数据', Icon: BarChart3 },
  { href: '/records', label: '记录', Icon: ClipboardList },
  { href: '/profile', label: '档案', Icon: Cat },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] border-t border-ink/[0.07] bg-cream/95 backdrop-blur-md dark:border-white/10 dark:bg-night/95 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex h-16 items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);

          return (
            <li key={href} className="relative flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className="relative flex h-full min-h-[44px] flex-col items-center justify-center gap-1"
              >
                {active ? (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    className="absolute top-0 h-[3px] w-8 rounded-full bg-gold"
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 32,
                    }}
                  />
                ) : null}

                <Icon
                  aria-hidden="true"
                  size={22}
                  strokeWidth={active ? 2.4 : 1.8}
                  className={
                    active
                      ? 'text-gold-deep dark:text-gold'
                      : 'text-muted'
                  }
                />
                <span
                  className={
                    active
                      ? 'text-[11px] font-semibold text-gold-deep dark:text-gold'
                      : 'text-[11px] font-medium text-muted'
                  }
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
