// The Terces logo: a hexagonal camera aperture closing on an orange point (the symbol), and a
// hand-drawn wordmark whose last E carries an orange bar. One geometry, shared by the SVG
// components, the app icons and the share card.

type P = [number, number];
const hex = (r: number, rot: number, c = 32): P[] =>
  Array.from({ length: 6 }, (_, i) => {
    const t = (Math.PI / 3) * i + rot;
    return [c + r * Math.cos(t), c + r * Math.sin(t)];
  });

/** Symbol on a 64-unit grid. */
const OUTER = hex(28, Math.PI / 6);
const INNER = hex(9, 0);
/** Blade cuts: from each inner corner, outward along the inner edge's direction. */
const CUTS: [P, P][] = INNER.map((p, k) => {
  const q = INNER[(k + 1) % 6]!;
  return [p, [p[0] - (q[0] - p[0]) * 4, p[1] - (q[1] - p[1]) * 4]];
});
export const SYMBOL = {
  outer: OUTER,
  inner: INNER,
  cuts: CUTS,
  cutWidth: 2.6,
  dot: { cx: 32, cy: 32, r: 3.2 },
} as const;

const pts = (a: readonly P[]) => a.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
/** SVG path data for the symbol's solid part (hexagon with the centre hole). */
export const symbolPath = `M${pts(OUTER).replace(/ /g, 'L')}ZM${pts(INNER).replace(/ /g, 'L')}Z`;
export const cutsPath = CUTS.map(
  ([a, b]) => `M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}`,
).join('');

/** Wordmark: strokes as polylines, a third value is the corner radius at that point. */
type Q = [number, number, number?];
const SW = 5.5;
const H = 40;
const W = 46;
const GAP = 17;
const s = SW / 2;
const LETTERS: Record<string, Q[][]> = {
  T: [
    [
      [0, s],
      [W, s],
    ],
    [
      [W / 2, s],
      [W / 2, H],
    ],
  ],
  E: [
    [
      [W, s],
      [s, s, 10.25],
      [s, H - s, 10.25],
      [W, H - s],
    ],
    [
      [12, 20],
      [W - 8, 20],
    ],
  ],
  R: [
    [
      [s, H],
      [s, s],
      [44, s, 9],
      [44, 23.75, 9],
      [s, 23.75],
    ],
    [
      [30, 23.75],
      [W - 1, H],
    ],
  ],
  C: [
    [
      [W, s],
      [s, s, 10.25],
      [s, H - s, 10.25],
      [W, H - s],
    ],
  ],
  S: [
    [
      [W, s],
      [s, s, 8.625],
      [s, 20, 8.625],
      [W - s, 20, 8.625],
      [W - s, H - s, 8.625],
      [0, H - s],
    ],
  ],
};
export const WORDMARK = { height: H, width: 6 * W + 5 * GAP, stroke: SW } as const;

interface Stroke {
  pts: Q[];
  accent: boolean;
}
/** Every stroke of TERCES in wordmark units, the last E's bar flagged as accent. */
export const WORDMARK_STROKES: Stroke[] = 'TERCES'.split('').flatMap((ch, i) =>
  LETTERS[ch]!.map((pts, j) => ({
    pts: pts.map(([x, y, r]) => [x + i * (W + GAP), y, r] as Q),
    accent: i === 4 && j === 1,
  })),
);

/** SVG path data for a rounded polyline (90 degree corners). */
export function polylinePath(q: Q[]): string {
  let d = `M${q[0]![0]} ${q[0]![1]}`;
  for (let i = 1; i < q.length; i++) {
    const [x, y, r] = q[i]!;
    if (!r || i === q.length - 1) {
      d += `L${x} ${y}`;
      continue;
    }
    const [px, py] = q[i - 1]!;
    const [nx, ny] = q[i + 1]!;
    const u = (ax: number, ay: number) => {
      const l = Math.hypot(ax, ay) || 1;
      return [ax / l, ay / l] as const;
    };
    const [ix, iy] = u(x - px, y - py);
    const [ox, oy] = u(nx - x, ny - y);
    const sweep = ix * oy - iy * ox > 0 ? 1 : 0;
    d += `L${+(x - ix * r).toFixed(3)} ${+(y - iy * r).toFixed(3)}A${r} ${r} 0 0 ${sweep} ${+(x + ox * r).toFixed(3)} ${+(y + oy * r).toFixed(3)}`;
  }
  return d;
}

type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arcTo'
  | 'closePath'
  | 'arc'
  | 'fill'
  | 'stroke'
> & {
  strokeStyle: unknown;
  fillStyle: unknown;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
};

export interface MarkColors {
  /** Blades and wordmark accent-free strokes use these. */
  main: string;
  accent: string;
  /** Colour behind the symbol: the blade cuts are drawn in it. */
  bg: string;
}

/** Draws the symbol, `size` px square, top-left at (x, y). */
export function drawSymbol(ctx: Ctx2D, x: number, y: number, size: number, c: MarkColors) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  ctx.fillStyle = c.main;
  ctx.beginPath();
  OUTER.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.bg;
  ctx.beginPath();
  INNER.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  // Cuts, kept inside the hexagon: they stop at the outer edge because the blades end there.
  ctx.strokeStyle = c.bg;
  ctx.lineWidth = SYMBOL.cutWidth;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const [a, b] of CUTS) {
    const e = clipToHex(a, b);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(e[0], e[1]);
  }
  ctx.stroke();
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(SYMBOL.dot.cx, SYMBOL.dot.cy, SYMBOL.dot.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Where segment a->b leaves the outer hexagon. */
function clipToHex(a: P, b: P): P {
  let best = 1;
  for (let i = 0; i < 6; i++) {
    const p = OUTER[i]!;
    const q = OUTER[(i + 1) % 6]!;
    const d1x = b[0] - a[0];
    const d1y = b[1] - a[1];
    const d2x = q[0] - p[0];
    const d2y = q[1] - p[1];
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p[0] - a[0]) * d2y - (p[1] - a[1]) * d2x) / den;
    const u = ((p[0] - a[0]) * d1y - (p[1] - a[1]) * d1x) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return [a[0] + (b[0] - a[0]) * (best + 0.02), a[1] + (b[1] - a[1]) * (best + 0.02)];
}

/** Draws the wordmark `h` px tall, top-left at (x, y). Returns its width in px. */
export function drawWordmark(
  ctx: Ctx2D,
  x: number,
  y: number,
  h: number,
  c: { main: string; accent: string },
): number {
  const k = h / H;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineWidth = SW;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  for (const st of WORDMARK_STROKES) {
    ctx.strokeStyle = st.accent ? c.accent : c.main;
    ctx.beginPath();
    st.pts.forEach(([px, py], i) => {
      if (i === 0) return ctx.moveTo(px, py);
      const r = st.pts[i]![2];
      const next = st.pts[i + 1];
      if (r && next) ctx.arcTo(px, py, next[0], next[1], r);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  ctx.restore();
  return WORDMARK.width * k;
}
