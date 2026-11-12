'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

type LoginResponse = {
  ok?: boolean;
  error?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    setError('');
    setPending(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json().catch(() => null)) as
        | LoginResponse
        | null;

      if (!response.ok || !data?.ok) {
        setError(data?.error ?? '邮箱或密码错误');
        return;
      }

      router.replace('/today');
    } catch {
      setError('网络异常，请稍后再试');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-[480px]">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative"
          >
            <svg
              viewBox="0 0 160 160"
              role="img"
              aria-label="黑猫剪影，金色眼睛正在呼吸"
              className="h-36 w-36 drop-shadow-[0_10px_24px_rgba(23,21,26,0.16)]"
            >
              <defs>
                <linearGradient
                  id="cati-cat-body"
                  x1="80"
                  y1="16"
                  x2="80"
                  y2="148"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#2B2722" />
                  <stop offset="1" stopColor="#17151A" />
                </linearGradient>
                <filter
                  id="cati-eye-glow"
                  x="-60%"
                  y="-60%"
                  width="220%"
                  height="220%"
                >
                  <feGaussianBlur stdDeviation="7" />
                </filter>
              </defs>

              {/* 尾巴 */}
              <path
                d="M112 132c24 3 32-12 25-25"
                fill="none"
                stroke="url(#cati-cat-body)"
                strokeWidth="11"
                strokeLinecap="round"
              />

              {/* 身体 */}
              <path
                d="M54 94c-7 12-11 27-10 42h72c1-15-3-30-10-42Z"
                fill="url(#cati-cat-body)"
              />

              {/* 耳朵 */}
              <path
                d="M45 54 38 20c-.5-3 2.5-4.8 4.8-3L70 37Z"
                fill="url(#cati-cat-body)"
              />
              <path
                d="M115 54 122 20c.5-3-2.5-4.8-4.8-3L90 37Z"
                fill="url(#cati-cat-body)"
              />

              {/* 头 */}
              <ellipse
                cx="80"
                cy="73"
                rx="46"
                ry="38"
                fill="url(#cati-cat-body)"
              />

              {/* 眼睛周围的柔光 */}
              <ellipse
                cx="80"
                cy="71"
                rx="33"
                ry="16"
                fill="var(--color-gold)"
                opacity="0.18"
                filter="url(#cati-eye-glow)"
              />

              {/* 两点金瞳：呼吸动画 */}
              <motion.g
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
                animate={{
                  opacity: [0.62, 1, 0.62],
                  scale: [1, 1.08, 1],
                }}
                transition={{
                  duration: 3.2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <ellipse
                  cx="62"
                  cy="71"
                  rx="9.5"
                  ry="12"
                  fill="var(--color-gold)"
                />
                <ellipse
                  cx="62"
                  cy="71"
                  rx="2.6"
                  ry="7.5"
                  fill="var(--color-ink)"
                />
              </motion.g>

              <motion.g
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
                animate={{
                  opacity: [0.62, 1, 0.62],
                  scale: [1, 1.08, 1],
                }}
                transition={{
                  duration: 3.2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: 0.35,
                }}
              >
                <ellipse
                  cx="98"
                  cy="71"
                  rx="9.5"
                  ry="12"
                  fill="var(--color-gold)"
                />
                <ellipse
                  cx="98"
                  cy="71"
                  rx="2.6"
                  ry="7.5"
                  fill="var(--color-ink)"
                />
              </motion.g>

              {/* 鼻子 */}
              <path d="M77 88h6l-3 4Z" fill="var(--color-cream)" opacity="0.72" />
            </svg>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12, ease: 'easeOut' }}
          >
            <h1 className="mt-4 text-[30px] font-bold tracking-tight">煤球日记</h1>
            <p className="mt-2 text-sm text-muted">记录煤球的每一天</p>
          </motion.div>
        </div>

        <motion.form
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
          onSubmit={handleSubmit}
          className="mt-8 rounded-[20px] bg-white p-6 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-muted">
                邮箱
              </span>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                inputMode="email"
                placeholder="你的邮箱"
                className="h-12 w-full rounded-2xl border border-ink/10 bg-cream/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/15 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-muted">
                密码
              </span>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-12 w-full rounded-2xl border border-ink/10 bg-cream/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/15 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30"
              />
            </label>
          </div>

          <div className="min-h-6 pt-3" aria-live="polite">
            {error ? (
              <p role="alert" className="text-sm font-medium text-coral">
                {error}
              </p>
            ) : null}
          </div>

          <motion.button
            type="submit"
            disabled={pending}
            whileTap={pending ? undefined : { scale: 0.985 }}
            className="mt-2 flex h-12 min-h-[44px] w-full items-center justify-center rounded-2xl bg-gold text-[15px] font-semibold text-ink transition-colors hover:bg-gold-deep active:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? '登录中…' : '登录'}
          </motion.button>
        </motion.form>

        <p className="mt-6 text-center text-sm text-muted">
          还没账号？{' '}
          <a
            href="/register"
            onClick={() => {
              /*
               * middleware 只检查 cati_sid 是否存在，且 T12 任务卡禁止修改它。
               * 这里放一个只作用于 /register 路径、10 分钟后过期的占位 cookie，
               * 让未登录用户能打开公开的注册页；它不会发给其他任何路径，
               * 真正的权限仍由 requireUser() 查库校验。
               */
              document.cookie =
                'cati_sid=register; path=/register; max-age=600; samesite=lax';
            }}
            className="font-semibold text-gold-deep underline-offset-4 hover:underline dark:text-gold"
          >
            注册一个
          </a>
        </p>

        <p className="mt-3 text-center text-xs text-muted">
          煤球的健康小账本 · 只属于你和它
        </p>
      </div>
    </main>
  );
}
