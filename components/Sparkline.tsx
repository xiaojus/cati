type SparklineProps = {
  values: Array<number | null>;
  min: number;
  max: number;
  label: string;
};

const WIDTH = 100;
const HEIGHT = 32;
const PAD_X = 3;
const PAD_Y = 4;

type Point = { x: number; y: number };

/**
 * 纯 SVG sparkline：不依赖图表库，也不需要在客户端运行。
 * 缺失的日期会断开折线，最后一个有效点用圆点标出。
 */
export default function Sparkline({
  values,
  min,
  max,
  label,
}: SparklineProps) {
  const span = Math.max(max - min, 1);
  const step =
    values.length > 1 ? (WIDTH - PAD_X * 2) / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    if (value === null) {
      return null;
    }

    const clamped = Math.min(max, Math.max(min, value));

    return {
      x: PAD_X + index * step,
      y: PAD_Y + (1 - (clamped - min) / span) * (HEIGHT - PAD_Y * 2),
    };
  });

  const segments: Point[][] = [];
  let current: Point[] = [];

  for (const point of points) {
    if (point) {
      current.push(point);
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    segments.push(current);
  }

  const lastPoint = [...points]
    .reverse()
    .find((point): point is Point => point !== null);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="h-8 w-full text-gold"
    >
      {segments.length === 0 ? (
        <path
          d={`M ${PAD_X} ${HEIGHT / 2} L ${WIDTH - PAD_X} ${HEIGHT / 2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="3 4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.28}
        />
      ) : null}

      {segments.map((segment, index) => (
        <path
          key={`line-${index}`}
          d={segment
            .map(
              (point, pointIndex) =>
                `${pointIndex === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
            )
            .join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.9}
        />
      ))}

      {points.map((point, index) =>
        point ? (
          <path
            key={`dot-${index}`}
            d={`M ${point.x.toFixed(2)} ${point.y.toFixed(2)} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={point === lastPoint ? 5 : 3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
    </svg>
  );
}
