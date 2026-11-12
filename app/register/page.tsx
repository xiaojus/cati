'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';
import { useTransition } from 'react';
import type { FormEvent } from 'react';
import { register } from '@/app/actions/auth';

const INPUT_CLASS =
  'h-12 w-full rounded-2xl border border-ink/10 bg-cream/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/15 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30';

const LABEL_CLASS = 'mb-2 block text-sm font-medium text-muted';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    setError('');

    startTransition(async () => {
      try {
        const result = await register({ email, password, displayName });
        if (result && !result.ok) {
          setError(result.error);
        }
      } catch (cause) {
        // redirect() 的 NEXT_REDIRECT 必须交回框架处理，只兜底真正的网络异常。
        if (
          cause &&
          typeof cause === 'object' &&
          'digest' in cause &&
          typeof cause.digest === 'string' &&
          cause.digest.startsWith('NEXT_REDIRECT')
        ) {
          throw cause;
        }

        setError('网络异常，请稍后再试');
      }
    });
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
              className="h-32 w-32 drop-shadow-[0_10px_24px_rgba(23,21,26,0.16)]"
            >
              <defs>
                <linearGradient
                  id="cati-register-cat-body"
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
                  id="cati-register-eye-glow"
                  x="-60%"
                  y="-60%"
                  width="220%"
                  height="220%"
                >
                  <feGaussianBlur stdDeviation="7" />
                </filter>
              </defs>

              <path
                d="M112 132c24 3 32-12 25-25"
                fill="none"
                stroke="url(#cati-register-cat-body)"
                strokeWidth="11"
                strokeLinecap="round"
              />
              <path
                d="M54 94c-7 12-11 27-10 42h72c1-15-3-30-10-42Z"
                fill="url(#cati-register-cat-body)"
              />
              <path
                d="M45 54 38 20c-.5-3 2.5-4.8 4.8-3L70 37Z"
                fill="url(#cati-register-cat-body)"
              />
              <path
                d="M115 54 122 20c.5-3-2.5-4.8-4.8-3L90 37Z"
                fill="url(#cati-register-cat-body)"
              />
              <ellipse
                cx="80"
                cy="73"
                rx="46"
                ry="38"
                fill="url(#cati-register-cat-body)"
              />
              <ellipse
                cx="80"
                cy="71"
                rx="33"
                ry="16"
                fill="var(--color-gold)"
                opacity="0.18"
                filter="url(#cati-register-eye-glow)"
              />

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

              <path
                d="M77 88h6l-3 4Z"
                fill="var(--color-cream)"
                opacity="0.72"
              />
            </svg>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12, ease: 'easeOut' }}
          >
            <h1 className="mt-4 text-[30px] font-bold tracking-tight">创建账号</h1>
            <p className="mt-2 text-sm text-muted">
              先给自己一个身份，再和猫相遇
            </p>
          </motion.div>
        </div>

        <motion.form
          noValidate
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
          onSubmit={handleSubmit}
          className="mt-8 rounded-[20px] bg-white p-6 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]"
        >
          <div className="space-y-4">
            <label className="block">
              <span className={LABEL_CLASS}>邮箱</span>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="你的邮箱"
                className={INPUT_CLASS}
              />
            </label>

            <label className="block">
              <span className={LABEL_CLASS}>密码</span>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="至少 8 位"
                className={INPUT_CLASS}
              />
            </label>

            <label className="block">
              <span className={LABEL_CLASS}>昵称</span>
              <input
                type="text"
                name="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="nickname"
                maxLength={12}
                placeholder="家里怎么称呼你"
                className={INPUT_CLASS}
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
            {pending ? '注册中…' : '注册'}
          </motion.button>
        </motion.form>

        <p className="mt-6 text-center text-sm text-muted">
          已有账号？{' '}
          <Link
            href="/login"
            className="font-semibold text-gold-deep underline-offset-4 hover:underline dark:text-gold"
          >
            去登录
          </Link>
        </p>
      </div>
    </main>
  );
}
