'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Plus, X } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { saveLog } from '@/app/actions/logs';
import {
  formatDateCn,
  isValidDateString,
  todayInShanghai,
} from '@/lib/dates';

type PointKey =
  | 'appetite'
  | 'water'
  | 'stool_score'
  | 'energy'
  | 'vomit_count';

type PointValues = Record<PointKey, number | null>;

type FieldKey = 'date' | 'stool_count' | 'weight_g' | 'note' | PointKey;

type AiParseResult = {
  date: string;
  appetite: number | null;
  water: number | null;
  stool_score: number | null;
  stool_count: number | null;
  vomit_count: number | null;
  energy: number | null;
  weight_g: number | null;
  note: string | null;
  warnings: string[];
  dropped: string[];
};

type ParseApiResponse = {
  ok?: boolean;
  data?: AiParseResult;
  aiParseId?: string | null;
  error?: string;
};

type QuickLogSheetProps = {
  today: string;
  catName: string;
  initialDate?: string;
};

type QuickLogOpenDetail = {
  initialDate?: string;
};

type QuickLogOpenButtonProps = {
  initialDate?: string;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
};

const QUICK_LOG_OPEN_EVENT = 'cati:quick-log-open';

/**
 * 抽屉外部的打开入口（今日页状态卡 / 补记提醒）。
 * 通过 window 事件把日期交给同一个 QuickLogSheet，避免整页变成客户端组件。
 */
export function QuickLogOpenButton({
  initialDate,
  ariaLabel,
  className,
  children,
}: QuickLogOpenButtonProps) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent<QuickLogOpenDetail>(QUICK_LOG_OPEN_EVENT, {
            detail: { initialDate },
          }),
        );
      }}
    >
      {children}
    </button>
  );
}

const POINT_KEYS: readonly PointKey[] = [
  'appetite',
  'water',
  'stool_score',
  'energy',
  'vomit_count',
];

const EMPTY_VALUES: PointValues = {
  appetite: null,
  water: null,
  stool_score: null,
  energy: null,
  vomit_count: null,
};

const SCORE_GROUPS = [
  {
    key: 'appetite',
    label: '食欲',
    hint: '1 很差 · 5 很好',
    max: 5,
  },
  {
    key: 'water',
    label: '饮水',
    hint: '1 很少 · 5 很多',
    max: 5,
  },
  {
    key: 'stool_score',
    label: '便便',
    hint: '1 干硬 · 4 理想 · 7 水样',
    max: 7,
  },
  {
    key: 'energy',
    label: '精神',
    hint: '1 萎靡 · 5 活泼',
    max: 5,
  },
] as const;

const VOMIT_OPTIONS = [
  { value: 0, label: '0', ariaLabel: '没有呕吐' },
  { value: 1, label: '1', ariaLabel: '呕吐 1 次' },
  { value: 2, label: '2', ariaLabel: '呕吐 2 次' },
  { value: 3, label: '3+', ariaLabel: '呕吐 3 次及以上' },
] as const;

const PAW_STAMPS = [
  { left: '24%', bottom: '16%', rotate: -18, delay: 0 },
  { left: '42%', bottom: '32%', rotate: 12, delay: 0.1 },
  { left: '62%', bottom: '48%', rotate: -8, delay: 0.2 },
  { left: '47%', bottom: '64%', rotate: 16, delay: 0.3 },
] as const;

function PawIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <ellipse cx="12" cy="16.2" rx="5.2" ry="4.2" />
      <circle cx="6.2" cy="11.1" r="2.1" />
      <circle cx="9.9" cy="7.3" r="2.1" />
      <circle cx="14.1" cy="7.3" r="2.1" />
      <circle cx="17.8" cy="11.1" r="2.1" />
    </svg>
  );
}

function AiDot() {
  return (
    <span
      role="img"
      aria-label="AI 填充"
      title="AI 填充"
      className="ml-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold align-middle"
    />
  );
}

function parseErrorMessage(
  status: number,
  payload: ParseApiResponse | null,
): string {
  if (status === 503) {
    return 'AI 解析未配置，先手动填吧';
  }
  if (status === 504) {
    return '解析超时，可以手动填';
  }
  if (status === 401) {
    return '登录已过期，请重新登录后再试';
  }
  if (status === 429) {
    return payload?.error ?? '解析太频繁，请稍后再试';
  }
  return '没听懂，可以手动填';
}

function ScoreGroup({
  label,
  hint,
  max,
  value,
  aiFilled,
  onChange,
}: {
  label: string;
  hint: string;
  max: number;
  value: number | null;
  aiFilled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink dark:text-cream">
        {label}
        {aiFilled ? <AiDot /> : null}
      </legend>
      <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: max }, (_, index) => index + 1).map((score) => {
          const selected = value === score;

          return (
            <button
              key={score}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : score)}
              className={`h-11 min-w-0 flex-1 rounded-xl border text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                selected
                  ? 'border-gold bg-gold text-ink shadow-[0_2px_8px_rgba(245,183,49,0.35)]'
                  : 'border-ink/10 bg-white/60 text-ink hover:border-gold/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream'
              }`}
            >
              {score}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function SuccessOverlay({
  catName,
  reduceMotion,
}: {
  catName: string;
  reduceMotion: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex min-h-[320px] flex-1 flex-col items-center justify-center overflow-hidden px-6 pb-10"
    >
      {PAW_STAMPS.map((paw, index) => (
        <motion.span
          key={index}
          aria-hidden="true"
          className="absolute text-gold"
          style={{ left: paw.left, bottom: paw.bottom }}
          initial={
            reduceMotion
              ? { opacity: 0.9 }
              : {
                  opacity: 0,
                  scale: 0.3,
                  rotate: paw.rotate - 20,
                  y: 14,
                }
          }
          animate={
            reduceMotion
              ? { opacity: 0.9 }
              : { opacity: 1, scale: 1, rotate: paw.rotate, y: 0 }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  type: 'spring',
                  stiffness: 340,
                  damping: 18,
                  delay: paw.delay,
                }
          }
        >
          <PawIcon className="h-10 w-10 drop-shadow-[0_4px_10px_rgba(245,183,49,0.35)]" />
        </motion.span>
      ))}

      <motion.div
        initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 320, damping: 20 }
        }
        className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-mint/15 text-mint"
      >
        <Check size={30} strokeWidth={3} aria-hidden="true" />
      </motion.div>

      <p className="relative z-10 mt-4 text-lg font-bold text-ink dark:text-cream">
        记好啦
      </p>
      <p className="relative z-10 mt-1 text-sm text-muted">
        {catName}收到你的记录了
      </p>
    </div>
  );
}

export default function QuickLogSheet({
  today,
  catName,
  initialDate,
}: QuickLogSheetProps) {
  const defaultDate =
    initialDate && isValidDateString(initialDate)
      ? initialDate
      : todayInShanghai();
  const [open, setOpen] = useState(false);
  const [logDate, setLogDate] = useState(defaultDate);
  const [values, setValues] = useState<PointValues>({ ...EMPTY_VALUES });
  const [stoolCount, setStoolCount] = useState('');
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  const [aiText, setAiText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [aiParseId, setAiParseId] = useState<string | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiDropped, setAiDropped] = useState<string[]>([]);
  const [aiFilled, setAiFilled] = useState<Set<FieldKey>>(() => new Set());

  const fabRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const submittingRef = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  const titleId = useId();
  const aiInputId = useId();
  const reduceMotion = useReducedMotion() === true;

  useEffect(() => {
    lockedRef.current = pending || success;
  }, [pending, success]);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
    };
  }, []);

  const resetForm = useCallback(
    (date: string = defaultDate) => {
      setLogDate(date);
      setValues({ ...EMPTY_VALUES });
      setStoolCount('');
      setWeight('');
      setNote('');
      setError(null);
      setAiText('');
      setParsing(false);
      setParseError(null);
      setAiParseId(null);
      setAiWarnings([]);
      setAiDropped([]);
      setAiFilled(new Set());
    },
    [defaultDate],
  );

  const closeSheet = useCallback(() => {
    if (lockedRef.current) {
      return;
    }

    aiAbortRef.current?.abort();
    setOpen(false);
    setError(null);
    setSuccess(false);
    window.setTimeout(() => fabRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSheet();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 80);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open, closeSheet]);

  const openSheet = useCallback(
    (date?: string) => {
      resetForm(date);
      setSuccess(false);
      setOpen(true);
    },
    [resetForm],
  );

  useEffect(() => {
    function handleOpenRequest(event: Event) {
      const requested = (event as CustomEvent<QuickLogOpenDetail>).detail
        ?.initialDate;

      openSheet(
        requested && isValidDateString(requested) && requested <= today
          ? requested
          : undefined,
      );
    }

    window.addEventListener(QUICK_LOG_OPEN_EVENT, handleOpenRequest);
    return () =>
      window.removeEventListener(QUICK_LOG_OPEN_EVENT, handleOpenRequest);
  }, [openSheet, today]);

  function clearAiMark(key: FieldKey) {
    setAiFilled((current) => {
      if (!current.has(key)) {
        return current;
      }

      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  function setPoint(key: PointKey, value: number | null) {
    setValues((current) => ({ ...current, [key]: value }));
    clearAiMark(key);
  }

  function applyAiResult(data: AiParseResult) {
    const filled = new Set<FieldKey>();

    if (data.date) {
      setLogDate(data.date);
      filled.add('date');
    }

    const aiPoints: Partial<PointValues> = {};
    for (const key of POINT_KEYS) {
      const value = data[key];
      if (typeof value === 'number') {
        aiPoints[key] = value;
        filled.add(key);
      }
    }
    setValues((current) => ({ ...current, ...aiPoints }));

    if (typeof data.stool_count === 'number') {
      setStoolCount(String(data.stool_count));
      filled.add('stool_count');
    }

    if (typeof data.weight_g === 'number') {
      setWeight(String(data.weight_g));
      filled.add('weight_g');
    }

    if (typeof data.note === 'string' && data.note.trim() !== '') {
      setNote(data.note);
      filled.add('note');
    }

    setAiFilled(filled);
  }

  async function handleParse() {
    const text = aiText.trim();
    if (parsing || text === '') {
      return;
    }

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    setParsing(true);
    setParseError(null);
    setAiParseId(null);
    setAiWarnings([]);
    setAiDropped([]);

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      const payload = (await response
        .json()
        .catch(() => null)) as ParseApiResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setParseError(parseErrorMessage(response.status, payload));
        return;
      }

      const warnings = Array.isArray(payload.data.warnings)
        ? payload.data.warnings
        : [];
      const dropped = Array.isArray(payload.data.dropped)
        ? payload.data.dropped
        : [];

      setParseError(null);
      setAiParseId(payload.aiParseId ?? null);
      setAiWarnings(warnings);
      setAiDropped(dropped);
      applyAiResult(payload.data);
    } catch {
      if (!controller.signal.aborted) {
        setParseError('没听懂，可以手动填');
      }
    } finally {
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null;
        setParsing(false);
      }
    }
  }

  async function handleSubmit(formData: FormData) {
    if (submittingRef.current || pending || success) {
      return;
    }

    submittingRef.current = true;
    setError(null);
    setPending(true);

    try {
      const result = await saveLog(formData, aiParseId ?? undefined);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(true);

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(10);
      }

      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }

      closeTimer.current = window.setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        resetForm();
        fabRef.current?.focus();
      }, 1200);
    } catch (cause) {
      console.error('[quick-log] 提交失败', cause);
      setError('保存失败，请检查网络后重试');
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-[480px] px-5 md:left-auto md:right-6 md:mx-0 md:w-auto md:max-w-none lg:right-10 lg:bottom-10"
      >
        <div className="flex justify-end">
          <motion.button
            ref={fabRef}
            type="button"
            onClick={() => openSheet()}
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="pointer-events-auto inline-flex h-14 min-h-[44px] items-center gap-2 rounded-full bg-gold px-5 text-sm font-bold text-ink shadow-[0_10px_28px_rgba(245,183,49,0.38)] transition-colors hover:bg-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold active:bg-gold-deep"
          >
            <Plus aria-hidden="true" size={20} strokeWidth={2.8} />
            记一笔
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="quick-log"
            className="fixed inset-0 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              aria-hidden="true"
              onClick={closeSheet}
              className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={reduceMotion ? false : { y: '100%' }}
              animate={{ y: 0 }}
              exit={reduceMotion ? undefined : { y: '100%' }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 320, damping: 32 }
              }
              className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[24px] border-t border-ink/10 bg-cream shadow-[0_-12px_40px_rgba(23,21,26,0.18)] dark:border-white/10 dark:bg-night"
            >
              <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
                <div className="min-w-0">
                  <h2
                    id={titleId}
                    className="text-lg font-bold text-ink dark:text-cream"
                  >
                    记录{' '}
                    {logDate && isValidDateString(logDate)
                      ? formatDateCn(logDate)
                      : '今天'}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    给{catName}记一笔 · 30 秒记下当天状态
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeSheet}
                  disabled={pending || success}
                  aria-label="关闭录入面板"
                  className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-cream"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              {success ? (
                <SuccessOverlay catName={catName} reduceMotion={reduceMotion} />
              ) : (
                <form
                  action={handleSubmit}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
                    {aiWarnings.length > 0 || aiDropped.length > 0 ? (
                      <div
                        role="status"
                        className="rounded-2xl border border-gold/30 bg-gold/10 px-3.5 py-3 text-xs leading-5 text-gold-deep dark:text-gold"
                      >
                        {aiWarnings.length > 0 ? (
                          <p className="font-semibold">
                            注意：{aiWarnings.join(' · ')}
                          </p>
                        ) : null}
                        {aiDropped.length > 0 ? (
                          <p
                            className={
                              aiWarnings.length > 0
                                ? 'mt-1 font-medium'
                                : 'font-medium'
                            }
                          >
                            {`有 ${aiDropped.length} 个值不在合理范围，已忽略`}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[11px] opacity-80">
                          AI 只做预填，保存前请核对。
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-ink/10 bg-white/60 p-3.5 dark:border-white/10 dark:bg-white/[0.04]">
                      <label
                        htmlFor={aiInputId}
                        className="block text-sm font-semibold text-ink dark:text-cream"
                      >
                        说一句
                      </label>
                      <p className="mt-0.5 text-[11px] text-muted">
                        例如：昨天食欲一般，吐了一次，体重 3.2 公斤
                      </p>
                      <textarea
                        id={aiInputId}
                        value={aiText}
                        onChange={(event) => setAiText(event.target.value)}
                        maxLength={300}
                        rows={2}
                        disabled={parsing}
                        placeholder="用一句话说说今天的情况…"
                        className="mt-2 w-full resize-none rounded-xl border border-ink/10 bg-white/70 px-3 py-2.5 text-[15px] leading-6 text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30"
                      />
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-[11px] tabular-nums text-muted">
                          {aiText.length}/300
                        </span>
                        <motion.button
                          type="button"
                          onClick={handleParse}
                          disabled={parsing || aiText.trim() === ''}
                          animate={
                            parsing && !reduceMotion
                              ? { opacity: [1, 0.55, 1], scale: [1, 1.02, 1] }
                              : { opacity: 1, scale: 1 }
                          }
                          transition={
                            parsing && !reduceMotion
                              ? {
                                  duration: 1.2,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                }
                              : { duration: 0.15 }
                          }
                          className="inline-flex h-11 min-h-[44px] items-center justify-center rounded-xl bg-gold px-5 text-sm font-bold text-ink shadow-[0_2px_10px_rgba(245,183,49,0.3)] transition-colors hover:bg-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {parsing ? '解析中…' : '解析'}
                        </motion.button>
                      </div>
                      {parseError ? (
                        <p
                          role="alert"
                          className="mt-2 text-xs font-medium text-coral"
                        >
                          {parseError}
                        </p>
                      ) : null}
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-ink dark:text-cream">
                        日期
                        {aiFilled.has('date') ? <AiDot /> : null}
                      </span>
                      <input
                        type="date"
                        name="log_date"
                        value={logDate}
                        max={today}
                        required
                        onChange={(event) => {
                          setLogDate(event.target.value);
                          clearAiMark('date');
                        }}
                        className="h-12 w-full rounded-2xl border border-ink/10 bg-white/60 px-4 text-[15px] text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream"
                      />
                    </label>

                    <p className="rounded-xl bg-gold/10 px-3 py-2 text-[11px] leading-5 text-gold-deep dark:text-gold">
                      可只填一项。留空的项目不会覆盖同一天已有的记录。
                    </p>

                    {SCORE_GROUPS.map((group) => (
                      <Fragment key={group.key}>
                        <ScoreGroup
                          label={group.label}
                          hint={group.hint}
                          max={group.max}
                          value={values[group.key]}
                          aiFilled={aiFilled.has(group.key)}
                          onChange={(value) => setPoint(group.key, value)}
                        />
                        {group.key === 'stool_score' ? (
                          <label className="block">
                            <span className="mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold text-ink dark:text-cream">
                              <span className="inline-flex items-center">
                                便便次数
                                {aiFilled.has('stool_count') ? <AiDot /> : null}
                              </span>
                              <span className="text-[11px] font-normal text-muted">
                                可选
                              </span>
                            </span>
                            <input
                              type="number"
                              name="stool_count"
                              value={stoolCount}
                              onChange={(event) => {
                                setStoolCount(event.target.value);
                                clearAiMark('stool_count');
                              }}
                              inputMode="numeric"
                              min={0}
                              max={10}
                              step={1}
                              placeholder="例如 1"
                              className="h-12 w-full rounded-2xl border border-ink/10 bg-white/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30"
                            />
                          </label>
                        ) : null}
                      </Fragment>
                    ))}

                    <fieldset>
                      <legend className="text-sm font-semibold text-ink dark:text-cream">
                        呕吐次数
                        {aiFilled.has('vomit_count') ? <AiDot /> : null}
                      </legend>
                      <p className="mt-0.5 text-[11px] text-muted">
                        今天一共吐了几次
                      </p>
                      <div className="mt-2 flex gap-1.5">
                        {VOMIT_OPTIONS.map((option) => {
                          const selected =
                            option.value === 3
                              ? (values.vomit_count ?? 0) >= 3
                              : values.vomit_count === option.value;

                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={selected}
                              aria-label={option.ariaLabel}
                              onClick={() =>
                                setPoint(
                                  'vomit_count',
                                  selected ? null : option.value,
                                )
                              }
                              className={`h-11 min-w-0 flex-1 rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                                selected
                                  ? 'border-gold bg-gold text-ink shadow-[0_2px_8px_rgba(245,183,49,0.35)]'
                                  : 'border-ink/10 bg-white/60 text-ink hover:border-gold/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream'
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    <label className="block">
                      <span className="mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold text-ink dark:text-cream">
                        <span className="inline-flex items-center">
                          体重（克）
                          {aiFilled.has('weight_g') ? <AiDot /> : null}
                        </span>
                        <span className="text-[11px] font-normal text-muted">
                          可选
                        </span>
                      </span>
                      <input
                        type="number"
                        name="weight_g"
                        value={weight}
                        onChange={(event) => {
                          setWeight(event.target.value);
                          clearAiMark('weight_g');
                        }}
                        inputMode="numeric"
                        min={500}
                        max={15000}
                        step={1}
                        placeholder="例如 3250"
                        className="h-12 w-full rounded-2xl border border-ink/10 bg-white/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold text-ink dark:text-cream">
                        <span className="inline-flex items-center">
                          备注
                          {aiFilled.has('note') ? <AiDot /> : null}
                        </span>
                        <span className="text-[11px] font-normal text-muted">
                          可选
                        </span>
                      </span>
                      <input
                        type="text"
                        name="note"
                        value={note}
                        onChange={(event) => {
                          setNote(event.target.value);
                          clearAiMark('note');
                        }}
                        maxLength={200}
                        placeholder="例如：今天胃口不错"
                        className="h-12 w-full rounded-2xl border border-ink/10 bg-white/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30"
                      />
                    </label>

                    {Object.entries(values).map(([key, value]) => (
                      <input
                        key={key}
                        type="hidden"
                        name={key}
                        value={value ?? ''}
                      />
                    ))}
                  </div>

                  <div
                    className="border-t border-ink/[0.06] bg-cream px-5 pt-3 dark:border-white/10 dark:bg-night"
                    style={{
                      paddingBottom:
                        'calc(0.75rem + env(safe-area-inset-bottom))',
                    }}
                  >
                    {error ? (
                      <p
                        role="alert"
                        className="mb-2 rounded-xl bg-coral/10 px-3 py-2 text-sm font-medium text-coral"
                      >
                        {error}
                      </p>
                    ) : null}

                    <button
                      type="submit"
                      disabled={pending}
                      className="flex h-12 min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-gold text-[15px] font-semibold text-ink transition-colors hover:bg-gold-deep active:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pending ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink"
                          />
                          保存中…
                        </>
                      ) : (
                        '保存记录'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
