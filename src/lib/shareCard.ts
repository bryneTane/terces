// The "share the warning" card: drawn from scratch from numbers only. Its input type has no
// image and no strings from the photo, so neither the photo nor any text read in it can reach it.
import { translate, type Locale } from '../i18n.tsx';
import { drawSymbol, drawWordmark } from '../styles/mark.ts';
import { ICE } from '../styles/palette.ts';

export const CARD_W = 1080;
export const CARD_H = 1350;
export const APP_HOST = 'terces.pages.dev';
export const CARD_FILENAME = 'terces-warning.png';

export type CardCategory = 'metadata' | 'face' | 'text' | 'plate' | 'person';
export interface ShareCardInput {
  count: number;
  breakdown: Partial<Record<CardCategory, number>>;
  locale: Locale;
}

/** Colours for the card: the Ice palette (the card is drawn off-DOM). */
export const CARD_COLORS = ICE;
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export interface CardCanvas {
  getContext(type: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  width: number;
  height: number;
}
export type CanvasFactory = (w: number, h: number) => CardCanvas;
export type ToPng = (canvas: CardCanvas) => Promise<Blob>;

const defaultFactory: CanvasFactory = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const defaultToPng: ToPng = (c) =>
  'convertToBlob' in c
    ? (c as OffscreenCanvas).convertToBlob({ type: 'image/png' })
    : new Promise((res, rej) =>
        (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'),
      );

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function icon(ctx: Ctx, cat: CardCategory, x: number, y: number, s: number) {
  ctx.save();
  ctx.strokeStyle = CARD_COLORS.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  switch (cat) {
    case 'face':
      ctx.ellipse(x + s / 2, y + s / 2, s * 0.32, s * 0.4, 0, 0, Math.PI * 2);
      break;
    case 'text':
      for (let i = 0; i < 3; i++) {
        ctx.moveTo(x + 6, y + 14 + i * 16);
        ctx.lineTo(x + s - 6 - (i === 2 ? 18 : 0), y + 14 + i * 16);
      }
      break;
    case 'plate':
      ctx.rect(x + 2, y + s * 0.28, s - 4, s * 0.44);
      break;
    case 'person':
      ctx.arc(x + s / 2, y + s * 0.26, s * 0.16, 0, Math.PI * 2);
      ctx.moveTo(x + s * 0.2, y + s);
      ctx.lineTo(x + s * 0.2, y + s * 0.72);
      ctx.quadraticCurveTo(x + s / 2, y + s * 0.38, x + s * 0.8, y + s * 0.72);
      ctx.lineTo(x + s * 0.8, y + s);
      break;
    case 'metadata':
      ctx.moveTo(x + s / 2, y + s);
      ctx.bezierCurveTo(x - s * 0.1, y + s * 0.4, x + s * 0.2, y, x + s / 2, y);
      ctx.bezierCurveTo(x + s * 0.8, y, x + s * 1.1, y + s * 0.4, x + s / 2, y + s);
      ctx.moveTo(x + s * 0.62, y + s * 0.36);
      ctx.arc(x + s / 2, y + s * 0.36, s * 0.12, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

/** Splits a headline over lines that fit `max` px. */
function wrap(ctx: Ctx, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderShareCard(
  input: ShareCardInput,
  factory: CanvasFactory = defaultFactory,
  toPng: ToPng = defaultToPng,
): Promise<Blob> {
  const { count, breakdown, locale } = input;
  const t = (k: string, n?: number) => translate(locale, k, n === undefined ? undefined : { count: n });
  const canvas = factory(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  // Background: void with a faint HUD grid and frame corners.
  ctx.fillStyle = CARD_COLORS.void;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = CARD_COLORS.line;
  ctx.lineWidth = 1;
  for (let x = 0; x <= CARD_W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, CARD_H);
    ctx.stroke();
  }
  for (let y = 0; y <= CARD_H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(CARD_W, y + 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = CARD_COLORS.accent;
  ctx.lineWidth = 6;
  for (const [cx, cy, dx, dy] of [
    [60, 60, 1, 1],
    [CARD_W - 60, 60, -1, 1],
    [60, CARD_H - 60, 1, -1],
    [CARD_W - 60, CARD_H - 60, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * 70);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * 70, cy);
    ctx.stroke();
  }

  drawSymbol(ctx as CanvasRenderingContext2D, 110, 112, 64, {
    main: CARD_COLORS.accent,
    accent: CARD_COLORS.alert,
    bg: CARD_COLORS.void,
  });
  drawWordmark(ctx as CanvasRenderingContext2D, 196, 130, 28, {
    main: CARD_COLORS.ink,
    accent: CARD_COLORS.alert,
  });

  // The number.
  ctx.fillStyle = CARD_COLORS.alert;
  ctx.font = `700 300px ${MONO}`;
  ctx.fillText(String(count), 100, 480);

  ctx.fillStyle = CARD_COLORS.ink;
  ctx.font = `600 64px ${SANS}`;
  let y = 590;
  for (const line of wrap(ctx, t('card.headline', count), CARD_W - 220)) {
    ctx.fillText(line, 110, y);
    y += 78;
  }
  ctx.fillStyle = CARD_COLORS.accent;
  ctx.fillText(t('card.cta'), 110, y);

  // Breakdown rows, numbers only.
  y += 80;
  ctx.font = `500 40px ${SANS}`;
  for (const cat of ['metadata', 'face', 'text', 'plate', 'person'] as const) {
    const n = breakdown[cat] ?? 0;
    if (n <= 0) continue;
    icon(ctx, cat, 110, y, 56);
    ctx.fillStyle = CARD_COLORS.ink;
    ctx.fillText(t(`card.${cat}`, n), 200, y + 42);
    y += 84;
  }

  ctx.fillStyle = CARD_COLORS.muted;
  ctx.font = `400 32px ${SANS}`;
  ctx.fillText(t('card.footer'), 110, CARD_H - 170);
  ctx.fillStyle = CARD_COLORS.accent;
  ctx.font = `600 44px ${MONO}`;
  ctx.fillText(APP_HOST, 110, CARD_H - 110);

  return toPng(canvas);
}
