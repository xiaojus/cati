'use client';

import { useState } from 'react';

const THEME_COOKIE = 'cati_theme';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Theme = 'system' | 'light' | 'dark';

declare global {
  interface Window {
    /** 用户的原始偏好（system | light | dark），由根布局脚本与这里共同维护。 */
    __catiTheme?: Theme;
  }
}

const OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') {
    return theme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export default function ThemeToggle({ initial }: { initial?: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial ?? 'system');

  function select(next: Theme) {
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    document.documentElement.dataset.theme = resolveTheme(next);
    window.__catiTheme = next;
  }

  return (
    <div
      role="radiogroup"
      aria-label="外观"
      className="flex shrink-0 items-center gap-1 rounded-full bg-ink/[0.05] p-1 dark:bg-white/[0.07]"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === theme;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => select(option.value)}
            className={`h-11 rounded-full px-2.5 text-[11px] font-medium transition-colors ${
              selected
                ? 'bg-gold font-semibold text-ink'
                : 'text-muted hover:text-ink dark:hover:text-cream'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
