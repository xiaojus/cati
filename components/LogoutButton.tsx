'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';

export default function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        setError('退出失败，请重试');
        return;
      }

      window.location.assign('/login');
    } catch {
      setError('退出失败，请检查网络');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        className="inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-full border border-ink/10 px-3.5 text-xs font-semibold text-ink transition-colors hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-cream dark:hover:bg-white/[0.06]"
      >
        <LogOut size={14} aria-hidden="true" />
        {pending ? '退出中…' : '退出登录'}
      </button>
      {error ? (
        <p role="alert" className="mt-1 text-[10px] text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}
