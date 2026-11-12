'use client';

import { Check, ChevronDown, ChevronsUpDown, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  getCatSwitcherData,
  setCurrentCat,
  type SwitcherCat,
} from '@/app/actions/cat';
import { CatPortrait } from '@/components/CatEmpty';

type CatSwitcherProps =
  | { variant: 'sidebar' }
  | { variant: 'mobile'; currentCatId: string; cats: SwitcherCat[] };

/** 任意位置切换成功后广播，侧栏据此刷新自己的列表。 */
const CAT_CHANGED_EVENT = 'cati:cat-changed';

function notifyCatChanged() {
  window.dispatchEvent(new Event(CAT_CHANGED_EVENT));
}

function roleLabel(role: string): string {
  return role === 'owner' ? '创建者' : '家人';
}

function CatAvatar({
  cat,
  className,
}: {
  cat: SwitcherCat;
  className: string;
}) {
  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-gold/35 via-gold/15 to-cream ring-1 ring-ink/5 dark:from-gold/30 dark:via-gold/10 dark:to-white/5 dark:ring-white/10 ${className}`}
    >
      {cat.avatarUrl ? (
        // 头像来自用户配置，可能是任意外链，这里用原生 img 避免域名白名单。
        <img
          src={cat.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <CatPortrait className="h-full w-full" />
      )}
    </span>
  );
}

/**
 * 多猫切换器：
 * - sidebar：PC 侧栏顶部，点击展开下拉列表；
 * - mobile：今日页煤球卡右上角的小按钮，点击弹出底部 sheet。
 */
export default function CatSwitcher(props: CatSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogTitleId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [sidebarData, setSidebarData] = useState<{
    currentCatId: string;
    cats: SwitcherCat[];
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCatId, setPendingCatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSidebar = props.variant === 'sidebar';
  const cats = isSidebar ? (sidebarData?.cats ?? []) : props.cats;
  const currentCatId = isSidebar
    ? (sidebarData?.currentCatId ?? null)
    : props.currentCatId;
  const currentCat = cats.find((cat) => cat.id === currentCatId) ?? null;

  useEffect(() => {
    if (!isSidebar) {
      return;
    }

    let cancelled = false;

    function load() {
      getCatSwitcherData()
        .then((next) => {
          if (!cancelled) {
            setSidebarData(next);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError('宠物列表加载失败');
          }
        });
    }

    load();
    // 页面切换或任意位置切换宠物后，侧栏重新拉取，保持与页面一致。
    window.addEventListener(CAT_CHANGED_EVENT, load);

    return () => {
      cancelled = true;
      window.removeEventListener(CAT_CHANGED_EVENT, load);
    };
  }, [isSidebar, pathname]);

  const closeAll = useCallback(() => {
    setSidebarOpen(false);
    setMobileOpen(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setSidebarOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeAll();
      }
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen, closeAll]);

  async function switchTo(catId: string) {
    if (pendingCatId) {
      return;
    }

    if (catId === currentCatId) {
      closeAll();
      return;
    }

    setPendingCatId(catId);
    setError(null);

    try {
      const result = await setCurrentCat(catId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (isSidebar) {
        setSidebarData((current) =>
          current ? { ...current, currentCatId: catId } : current,
        );
        setSidebarOpen(false);
      } else {
        setMobileOpen(false);
      }

      notifyCatChanged();
      router.refresh();
    } catch {
      setError('切换失败，请稍后再试');
    } finally {
      setPendingCatId(null);
    }
  }

  function renderList(onAdd: () => void) {
    return (
      <>
        <ul className="space-y-1">
          {cats.map((cat) => {
            const active = cat.id === currentCatId;
            const pending = pendingCatId === cat.id;

            return (
              <li key={cat.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  disabled={pendingCatId !== null}
                  onClick={() => void switchTo(cat.id)}
                  className={`flex min-h-[44px] w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? 'bg-gold/15'
                      : 'hover:bg-ink/[0.04] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <CatAvatar cat={cat} className="h-9 w-9" />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink dark:text-cream">
                      {cat.name}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {roleLabel(cat.role)}
                    </span>
                  </span>

                  {pending ? (
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gold/30 border-t-gold"
                    />
                  ) : active ? (
                    <Check
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-gold-deep dark:text-gold"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <Link
          href="/profile#pets"
          onClick={onAdd}
          className="mt-2 flex min-h-[44px] items-center gap-2 rounded-2xl border border-dashed border-ink/10 px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-gold/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:border-white/10 dark:hover:text-cream"
        >
          <Plus size={15} aria-hidden="true" />
          添加另一只宠物
        </Link>
      </>
    );
  }

  if (isSidebar) {
    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={sidebarOpen}
          aria-label={
            currentCat ? `当前宠物 ${currentCat.name}，切换宠物` : '切换宠物'
          }
          disabled={!sidebarData}
          onClick={() => {
            setSidebarOpen((open) => !open);
            setError(null);
          }}
          className="flex min-h-[44px] w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-wait dark:hover:bg-white/[0.06]"
        >
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-gold/35 via-gold/15 to-cream ring-1 ring-ink/5 dark:from-gold/30 dark:via-gold/10 dark:to-white/5 dark:ring-white/10">
            {currentCat ? (
              currentCat.avatarUrl ? (
                // 头像来自用户配置，可能是任意外链，这里用原生 img 避免域名白名单。
                <img
                  src={currentCat.avatarUrl}
                  alt={`${currentCat.name}的头像`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <CatPortrait className="h-full w-full" />
              )
            ) : (
              <span
                aria-hidden="true"
                className="block h-full w-full animate-pulse bg-ink/10 dark:bg-white/10"
              />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ink dark:text-cream">
              {currentCat?.name ?? '加载中…'}
            </span>
            <span className="block truncate text-[11px] text-muted">
              {currentCat ? roleLabel(currentCat.role) : '健康记录'}
            </span>
          </span>

          {cats.length > 1 ? (
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`shrink-0 text-muted transition-transform ${
                sidebarOpen ? 'rotate-180' : ''
              }`}
            />
          ) : null}
        </button>

        {sidebarOpen ? (
          <div
            aria-label="切换宠物"
            className="absolute left-0 right-0 top-full z-50 mt-2 rounded-[20px] border border-ink/[0.07] bg-cream p-2 shadow-[0_12px_32px_rgba(23,21,26,0.16)] dark:border-white/10 dark:bg-night"
          >
            {renderList(() => setSidebarOpen(false))}
            {error ? (
              <p role="alert" className="mt-2 px-2 text-xs font-medium text-coral">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label="切换宠物"
        onClick={() => {
          setMobileOpen(true);
          setError(null);
        }}
        className="flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gold-deep transition-colors hover:bg-gold/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:text-gold"
      >
        <ChevronsUpDown size={17} aria-hidden="true" />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[70]">
          <div
            aria-hidden="true"
            onClick={closeAll}
            className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[24px] border-t border-ink/10 bg-cream shadow-[0_-12px_40px_rgba(23,21,26,0.18)] dark:border-white/10 dark:bg-night"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
              <div className="min-w-0">
                <h2
                  id={dialogTitleId}
                  className="text-lg font-bold text-ink dark:text-cream"
                >
                  切换宠物
                </h2>
                <p className="mt-1 text-xs text-muted">
                  每台设备可以看不同的猫
                </p>
              </div>
              <button
                type="button"
                onClick={closeAll}
                aria-label="关闭切换面板"
                className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:hover:bg-white/10 dark:hover:text-cream"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
              {renderList(closeAll)}
              {error ? (
                <p
                  role="alert"
                  className="mt-2 rounded-xl bg-coral/10 px-3 py-2 text-xs font-medium text-coral"
                >
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 档案页「我的宠物」里的切换按钮。 */
export function PetSwitchButton({
  catId,
  catName,
}: {
  catId: string;
  catName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitch() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await setCurrentCat(catId);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      notifyCatChanged();
      router.refresh();
    } catch {
      setError('切换失败，请稍后再试');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={handleSwitch}
        disabled={pending}
        aria-label={`切换到 ${catName}`}
        className="inline-flex h-11 min-h-[44px] items-center rounded-full bg-gold/15 px-3 text-xs font-semibold text-gold-deep transition-colors hover:bg-gold/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-60 dark:text-gold"
      >
        {pending ? '切换中…' : '切换'}
      </button>
      {error ? (
        <p role="alert" className="mt-1 max-w-[140px] text-[10px] text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}
