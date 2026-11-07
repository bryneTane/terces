// Grouped bar chart (scan, cloak) per day as inline SVG. No library, no effects on the data.
export interface DayCount {
  day: string;
  scan: number;
  cloak: number;
}

export const CHART = { width: 720, height: 260, left: 40, right: 8, top: 12, bottom: 28 };

/** A "nice" axis maximum: 1, 2 or 5 times a power of ten, at least 1. */
export function niceMax(n: number): number {
  if (n <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

/** `days` newest first (API order); drawn oldest to newest, left to right. */
export function BarChart({ days }: { days: DayCount[] }) {
  const { width, height, left, right, top, bottom } = CHART;
  const series = [...days].reverse();
  const max = niceMax(Math.max(0, ...series.flatMap((d) => [d.scan, d.cloak])));
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const slot = plotW / Math.max(1, series.length);
  const bar = Math.max(1, (slot - 2) / 2);
  const y = (v: number) => top + plotH - (v / max) * plotH;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Scans and cloaks per day, last ${series.length} days`}
      className="chart"
    >
      {[0, max / 2, max].map((t) => (
        <g key={t}>
          <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} className="grid" />
          <text x={left - 6} y={y(t) + 4} textAnchor="end" className="axis">
            {Math.round(t)}
          </text>
        </g>
      ))}
      {series.map((d, i) => {
        const x = left + i * slot + 1;
        return (
          <g key={d.day}>
            <g data-day={d.day}>
              <title>{`${d.day}: ${d.scan} scanned, ${d.cloak} cloaked`}</title>
              {(
                [
                  ['scan', d.scan, 0],
                  ['cloak', d.cloak, bar],
                ] as const
              ).map(([k, v, dx]) => {
                const h = (v / max) * plotH;
                return (
                  <rect
                    key={k}
                    x={x + dx}
                    y={top + plotH - h}
                    width={bar}
                    height={h}
                    className={`bar ${k}`}
                    data-value={v}
                  />
                );
              })}
            </g>
            {(i % 7 === 0 || i === series.length - 1) && (
              <text x={x + bar} y={height - 8} textAnchor="middle" className="axis">
                {d.day.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
