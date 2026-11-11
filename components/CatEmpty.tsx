import type { ReactNode } from 'react';

type CatArtProps = {
  className?: string;
};

const CAT_HEAD_PATH =
  'M16 18 L22 34 C17.5 39.5 15.5 45.5 15.5 51.5 C15.5 66 26.5 74 40 74 C53.5 74 64.5 66 64.5 51.5 C64.5 45.5 62.5 39.5 58 34 L64 18 L50 26.5 C47 25 43.5 24.2 40 24.2 C36.5 24.2 33 25 30 26.5 Z';

/** 实心黑猫头像：档案页使用。 */
export function CatPortrait({ className }: CatArtProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      role="img"
      aria-label="黑猫头像"
      className={className}
    >
      <path
        d={CAT_HEAD_PATH}
        fill="#17151A"
        stroke="rgba(255,249,240,0.18)"
        strokeWidth="1"
      />
      <ellipse cx="31.5" cy="48.5" rx="6" ry="7" fill="#F5B731" />
      <ellipse cx="48.5" cy="48.5" rx="6" ry="7" fill="#F5B731" />
      <ellipse cx="31.5" cy="48.5" rx="1.8" ry="4.6" fill="#17151A" />
      <ellipse cx="48.5" cy="48.5" rx="1.8" ry="4.6" fill="#17151A" />
      <path d="M37.5 58.5 Q40 61 42.5 58.5 Q40 57.2 37.5 58.5 Z" fill="#E86A4D" />
    </svg>
  );
}

/** 黑猫轮廓：空状态使用，跟随 currentColor 适配暗色模式。 */
export function CatOutline({ className }: CatArtProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      role="img"
      aria-label="黑猫轮廓"
      fill="none"
      className={className}
    >
      <path
        d={CAT_HEAD_PATH}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M61 65.5 C69.5 64.5 73.5 57 69.5 49.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <ellipse cx="31.5" cy="49" rx="4.6" ry="5.6" fill="#F5B731" />
      <ellipse cx="48.5" cy="49" rx="4.6" ry="5.6" fill="#F5B731" />
      <ellipse cx="31.5" cy="49" rx="1.4" ry="3.6" fill="#17151A" />
      <ellipse cx="48.5" cy="49" rx="1.4" ry="3.6" fill="#17151A" />
      <path
        d="M37.5 58 Q40 60.5 42.5 58 Q40 57 37.5 58 Z"
        fill="#E86A4D"
      />
    </svg>
  );
}

type CatEmptyProps = {
  title?: string;
  hint?: ReactNode;
  compact?: boolean;
  className?: string;
};

/** 统一的空状态：黑猫轮廓 + 说明文字。 */
export default function CatEmpty({
  title = '这段时间还没有记录',
  hint,
  compact = false,
  className,
}: CatEmptyProps) {
  return (
    <div
      className={[
        'flex flex-col items-center text-center',
        compact ? 'py-4' : 'px-4 py-8',
        className ?? '',
      ].join(' ')}
    >
      <CatOutline
        className={
          compact
            ? 'h-14 w-14 text-ink/80 dark:text-cream/80'
            : 'h-24 w-24 text-ink/80 dark:text-cream/80'
        }
      />
      <p
        className={
          compact
            ? 'mt-2 text-xs font-medium text-muted'
            : 'mt-3 text-sm font-semibold text-ink dark:text-cream'
        }
      >
        {title}
      </p>
      {hint ? (
        <p className="mt-1.5 max-w-[280px] text-xs leading-5 text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
