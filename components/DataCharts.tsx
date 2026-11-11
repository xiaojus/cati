'use client';

import type { CSSProperties } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDateCn } from '@/lib/dates';

export type DailyChartPoint = {
  date: string;
  weightKg: number | null;
  appetite: number | null;
  stoolScore: number | null;
  vomitCount: number | null;
};

const GOLD = '#F5B731';
const GOLD_DEEP = '#D99A1F';
const MINT = '#6FC2A1';
const CORAL = '#E86A4D';
const MUTED = '#8B8578';
const GRID = 'rgba(139,133,120,0.18)';

const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: '#FFF9F0',
  border: '1px solid rgba(23,21,26,0.08)',
  borderRadius: 12,
  boxShadow: '0 8px 24px rgba(23,21,26,0.12)',
  fontSize: 12,
  padding: '8px 10px',
};

const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: '#17151A',
  fontWeight: 600,
  marginBottom: 2,
};

const TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: '#17151A',
  fontSize: 12,
};

function shortDate(value: string): string {
  const parts = value.split('-');
  return parts.length === 3
    ? `${Number(parts[1])}/${Number(parts[2])}`
    : value;
}

function weightDomain(points: DailyChartPoint[]): [number, number] {
  const weights = points.flatMap((point) =>
    point.weightKg === null ? [] : [point.weightKg],
  );

  if (weights.length === 0) {
    return [0, 5];
  }

  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const pad = Math.max(0.1, (max - min) * 0.15);

  return [
    Math.floor((min - pad) * 10) / 10,
    Math.ceil((max + pad) * 10) / 10,
  ];
}

function commonAxisProps() {
  return {
    tick: { fill: MUTED, fontSize: 10 },
    axisLine: { stroke: GRID },
    tickLine: false,
  };
}

export function WeightChart({ points }: { points: DailyChartPoint[] }) {
  const hasData = points.some((point) => point.weightKg !== null);

  return (
    <div className="h-[190px] w-full min-w-0 overflow-hidden">
      <ResponsiveContainer
        width="100%"
        height={190}
        minWidth={0}
        initialDimension={{ width: 320, height: 190 }}
      >
        <LineChart
          data={points}
          margin={{ top: 8, right: 10, bottom: 0, left: -8 }}
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            minTickGap={18}
            interval="preserveStartEnd"
            {...commonAxisProps()}
          />
          <YAxis
            domain={weightDomain(points)}
            width={38}
            tickFormatter={(value) => Number(value).toFixed(1)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: MUTED, fontSize: 10 }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelFormatter={(label) => formatDateCn(String(label))}
            formatter={(value) => [
              `${Number(value).toFixed(2)} kg`,
              '体重',
            ]}
          />
          <Line
            type="monotone"
            dataKey="weightKg"
            name="体重"
            stroke={GOLD}
            strokeWidth={2.5}
            dot={
              hasData
                ? { r: 2.5, fill: GOLD, strokeWidth: 0 }
                : false
            }
            activeDot={{ r: 4.5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function stoolColor(value: number | null): string {
  if (value === null) {
    return 'transparent';
  }
  if (value >= 5) {
    return CORAL;
  }
  if (value <= 3) {
    return MINT;
  }
  return GOLD_DEEP;
}

export function StoolChart({ points }: { points: DailyChartPoint[] }) {
  return (
    <div className="h-[190px] w-full min-w-0 overflow-hidden">
      <ResponsiveContainer
        width="100%"
        height={190}
        minWidth={0}
        initialDimension={{ width: 320, height: 190 }}
      >
        <BarChart
          data={points}
          margin={{ top: 8, right: 10, bottom: 0, left: -8 }}
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            minTickGap={18}
            interval="preserveStartEnd"
            {...commonAxisProps()}
          />
          <YAxis
            domain={[1, 7]}
            ticks={[1, 3, 5, 7]}
            width={28}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: MUTED, fontSize: 10 }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelFormatter={(label) => formatDateCn(String(label))}
            formatter={(value) => [`${value} 分`, '便便评分']}
          />
          <Bar
            dataKey="stoolScore"
            name="便便评分"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          >
            {points.map((point) => (
              <Cell
                key={point.date}
                fill={stoolColor(point.stoolScore)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VomitChart({ points }: { points: DailyChartPoint[] }) {
  const maxVomit = Math.max(
    1,
    ...points.map((point) => point.vomitCount ?? 0),
  );

  return (
    <div className="h-[190px] w-full min-w-0 overflow-hidden">
      <ResponsiveContainer
        width="100%"
        height={190}
        minWidth={0}
        initialDimension={{ width: 320, height: 190 }}
      >
        <BarChart
          data={points}
          margin={{ top: 8, right: 10, bottom: 0, left: -8 }}
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            minTickGap={18}
            interval="preserveStartEnd"
            {...commonAxisProps()}
          />
          <YAxis
            domain={[0, maxVomit]}
            width={24}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: MUTED, fontSize: 10 }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelFormatter={(label) => formatDateCn(String(label))}
            formatter={(value) => [`${value} 次`, '呕吐']}
          />
          <Bar
            dataKey="vomitCount"
            name="呕吐次数"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          >
            {points.map((point) => (
              <Cell
                key={point.date}
                fill={(point.vomitCount ?? 0) > 0 ? CORAL : GOLD}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

function mondayFirstIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (weekday + 6) % 7;
}

function appetiteLevelClass(value: number | null): string {
  if (value === null) {
    return 'bg-ink/[0.05] dark:bg-white/[0.08]';
  }

  switch (value) {
    case 1:
      return 'bg-gold/15';
    case 2:
      return 'bg-gold/30';
    case 3:
      return 'bg-gold/50';
    case 4:
      return 'bg-gold/70';
    default:
      return 'bg-gold';
  }
}

/**
 * 食欲热图：固定展示最近 30 天，7 列（周一 → 周日）。
 * 纯 div 网格实现，不依赖 recharts。
 */
export function AppetiteHeatmap({ points }: { points: DailyChartPoint[] }) {
  const days = points.slice(-30);

  if (days.length === 0) {
    return null;
  }

  const leadingBlanks = mondayFirstIndex(days[0].date);

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <span
            key={`blank-${index}`}
            aria-hidden="true"
            className="aspect-square min-w-0 rounded-md"
          />
        ))}

        {days.map((day) => {
          const label =
            day.appetite === null
              ? `${formatDateCn(day.date)} 未记录食欲`
              : `${formatDateCn(day.date)} 食欲 ${day.appetite} 分`;

          return (
            <span
              key={day.date}
              role="img"
              aria-label={label}
              title={label}
              className={`aspect-square min-w-0 rounded-md ${appetiteLevelClass(
                day.appetite,
              )}`}
            />
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-muted">
        <span>少</span>
        {[1, 2, 3, 4, 5].map((level) => (
          <span
            key={level}
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-[3px] ${appetiteLevelClass(level)}`}
          />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}
