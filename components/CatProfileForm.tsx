'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Pencil, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { updateCat } from '@/app/actions/cat';
import { isValidDateString, todayInShanghai } from '@/lib/dates';

type CatProfileFormProps = {
  name: string;
  birthEst: string | null;
  sex: string | null;
  neutered: number | null;
  neuteredAt: string | null;
  isolationStart: string | null;
  note: string | null;
};

type Sex = 'F' | 'M' | 'U';

type FieldKey = 'name' | 'birthEst' | 'sex' | 'neuteredAt' | 'isolationStart' | 'note';

type FieldErrors = Partial<Record<FieldKey, string>>;

const INPUT_CLASS =
  'h-12 w-full rounded-2xl border border-ink/10 bg-white/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30';

const LABEL_CLASS =
  'mb-1.5 block text-xs font-semibold text-ink dark:text-cream';

const SEX_OPTIONS: readonly { value: Sex; label: string }[] = [
  { value: 'F', label: '母' },
  { value: 'M', label: '公' },
  { value: 'U', label: '未知' },
];

function normalizeSex(value: string | null): Sex {
  return value === 'F' || value === 'M' || value === 'U' ? value : 'U';
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p role="alert" className="mt-1 text-xs font-medium text-coral">
      {message}
    </p>
  );
}

export default function CatProfileForm({
  name: initialName,
  birthEst: initialBirthEst,
  sex: initialSex,
  neutered: initialNeutered,
  neuteredAt: initialNeuteredAt,
  isolationStart: initialIsolationStart,
  note: initialNote,
}: CatProfileFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [birthEst, setBirthEst] = useState(initialBirthEst ?? '');
  const [sex, setSex] = useState<Sex>(normalizeSex(initialSex));
  const [neutered, setNeutered] = useState(initialNeutered === 1);
  const [neuteredAt, setNeuteredAt] = useState(initialNeuteredAt ?? '');
  const [isolationStart, setIsolationStart] = useState(initialIsolationStart ?? '');
  const [note, setNote] = useState(initialNote ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingRef = useRef(false);
  const titleId = useId();
  const reduceMotion = useReducedMotion() === true;
  const today = todayInShanghai();

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) {
        setFormError(null);
        setOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
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
  }, [open]);

  function resetForm() {
    setName(initialName);
    setBirthEst(initialBirthEst ?? '');
    setSex(normalizeSex(initialSex));
    setNeutered(initialNeutered === 1);
    setNeuteredAt(initialNeuteredAt ?? '');
    setNote(initialNote ?? '');
    setErrors({});
    setFormError(null);
  }

  function openForm() {
    resetForm();
    setOpen(true);
  }

  function closeForm() {
    if (pending) {
      return;
    }

    setFormError(null);
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function clearError(key: FieldKey) {
    setErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function validate(): FieldErrors {
    const currentToday = todayInShanghai();
    const next: FieldErrors = {};
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      next.name = '请填写名字';
    } else if (trimmedName.length > 20) {
      next.name = '名字最多 20 个字';
    }

    if (birthEst !== '') {
      if (!isValidDateString(birthEst)) {
        next.birthEst = '生日日期不正确';
      } else if (birthEst > currentToday) {
        next.birthEst = '生日不能是未来';
      }
    }

    if (neutered && neuteredAt !== '') {
      if (!isValidDateString(neuteredAt)) {
        next.neuteredAt = '绝育日期不正确';
      } else if (
        birthEst !== '' &&
        isValidDateString(birthEst) &&
        neuteredAt < birthEst
      ) {
        next.neuteredAt = '绝育日期不能早于生日';
      }
    }

    if (isolationStart !== '') {
      if (!isValidDateString(isolationStart)) {
        next.isolationStart = '隔离起始日不正确';
      } else if (isolationStart > currentToday) {
        next.isolationStart = '隔离起始日不能是未来';
      }
    }

    if (note.trim().length > 200) {
      next.note = '备注最多 200 个字';
    }

    return next;
  }

  async function handleSubmit() {
    if (pending) {
      return;
    }

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError(null);
      return;
    }

    setErrors({});
    setFormError(null);
    setPending(true);

    try {
      const result = await updateCat({
        name: name.trim(),
        birthEst: birthEst || null,
        sex,
        neutered,
        neuteredAt: neutered ? neuteredAt || null : null,
        isolationStart: isolationStart || null,
        note: note.trim() || null,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setOpen(false);
      router.refresh();
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    } catch (cause) {
      console.error('[cat-profile] 保存失败', cause);
      setFormError('保存失败，请检查网络后重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openForm}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-11 min-h-[44px] shrink-0 items-center gap-1 self-start rounded-full px-3 text-xs font-semibold text-gold-deep transition-colors hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:text-gold"
      >
        <Pencil size={14} aria-hidden="true" />
        编辑
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="cat-profile"
            className="fixed inset-0 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              aria-hidden="true"
              onClick={closeForm}
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
                    className="truncate text-lg font-bold text-ink dark:text-cream"
                  >
                    编辑{initialName}的档案
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    改完保存，档案页和今日页会一起更新
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeForm}
                  disabled={pending}
                  aria-label="关闭档案编辑面板"
                  className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-cream"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              <form
                action={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
                  <label className="block">
                    <span className={LABEL_CLASS}>名字</span>
                    <input
                      type="text"
                      name="name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        clearError('name');
                      }}
                      maxLength={20}
                      autoComplete="off"
                      placeholder="例如：煤球"
                      className={INPUT_CLASS}
                    />
                    <FieldError message={errors.name} />
                  </label>

                  <label className="block">
                    <span className={LABEL_CLASS}>生日（可选）</span>
                    <input
                      type="date"
                      name="birthEst"
                      value={birthEst}
                      max={today}
                      onChange={(event) => {
                        setBirthEst(event.target.value);
                        clearError('birthEst');
                      }}
                      className={INPUT_CLASS}
                    />
                    <FieldError message={errors.birthEst} />
                    {!errors.birthEst ? (
                      <p className="mt-1 text-[11px] text-muted">
                        用于估算年龄，不确定时可以填大概日期
                      </p>
                    ) : null}
                  </label>

                  <fieldset>
                    <legend className={LABEL_CLASS}>性别</legend>
                    <div className="flex gap-1.5">
                      {SEX_OPTIONS.map((option) => {
                        const selected = sex === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              setSex(option.value);
                              clearError('sex');
                            }}
                            className={`h-11 min-h-[44px] min-w-0 flex-1 rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
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
                    <FieldError message={errors.sex} />
                  </fieldset>

                  <fieldset>
                    <legend className={LABEL_CLASS}>绝育</legend>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        aria-pressed={neutered}
                        onClick={() => setNeutered(true)}
                        className={`h-11 min-h-[44px] min-w-0 flex-1 rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                          neutered
                            ? 'border-gold bg-gold text-ink shadow-[0_2px_8px_rgba(245,183,49,0.35)]'
                            : 'border-ink/10 bg-white/60 text-ink hover:border-gold/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream'
                        }`}
                      >
                        已绝育
                      </button>
                      <button
                        type="button"
                        aria-pressed={!neutered}
                        onClick={() => {
                          setNeutered(false);
                          setNeuteredAt('');
                          clearError('neuteredAt');
                        }}
                        className={`h-11 min-h-[44px] min-w-0 flex-1 rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                          !neutered
                            ? 'border-gold bg-gold text-ink shadow-[0_2px_8px_rgba(245,183,49,0.35)]'
                            : 'border-ink/10 bg-white/60 text-ink hover:border-gold/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream'
                        }`}
                      >
                        未绝育
                      </button>
                    </div>
                  </fieldset>

                  <label className="block">
                    <span className={LABEL_CLASS}>绝育日期（可选）</span>
                    <input
                      type="date"
                      name="neuteredAt"
                      value={neuteredAt}
                      min={birthEst || undefined}
                      max={today}
                      disabled={!neutered}
                      onChange={(event) => {
                        setNeuteredAt(event.target.value);
                        clearError('neuteredAt');
                      }}
                      className={INPUT_CLASS}
                    />
                    <FieldError message={errors.neuteredAt} />
                    {!neutered && !errors.neuteredAt ? (
                      <p className="mt-1 text-[11px] text-muted">
                        选择「已绝育」后可填写
                      </p>
                    ) : null}
                  </label>

                  <label className="block">
                    <span className={LABEL_CLASS}>隔离起始日（可选）</span>
                    <input
                      type="date"
                      name="isolationStart"
                      value={isolationStart}
                      max={today}
                      onChange={(event) => {
                        setIsolationStart(event.target.value);
                        clearError('isolationStart');
                      }}
                      className={INPUT_CLASS}
                    />
                    <FieldError message={errors.isolationStart} />
                    <p className="mt-1 text-[11px] text-muted">
                      填了才会在今日页显示「隔离第 N 天」，每只猫各自独立
                    </p>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-semibold text-ink dark:text-cream">
                      <span>备注（可选）</span>
                      <span className="text-[11px] font-normal tabular-nums text-muted">
                        {note.length}/200
                      </span>
                    </span>
                    <textarea
                      name="note"
                      value={note}
                      onChange={(event) => {
                        setNote(event.target.value);
                        clearError('note');
                      }}
                      maxLength={200}
                      rows={3}
                      placeholder="例如：挑食，喜欢冻干"
                      className="w-full resize-none rounded-2xl border border-ink/10 bg-white/60 px-4 py-3 text-[15px] leading-6 text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30"
                    />
                    <FieldError message={errors.note} />
                  </label>
                </div>

                <div
                  className="border-t border-ink/[0.06] bg-cream px-5 pt-3 dark:border-white/10 dark:bg-night"
                  style={{
                    paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
                  }}
                >
                  {formError ? (
                    <p
                      role="alert"
                      className="mb-2 rounded-xl bg-coral/10 px-3 py-2 text-sm font-medium text-coral"
                    >
                      {formError}
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
                      '保存档案'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
