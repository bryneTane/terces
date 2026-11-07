// Masks, all destructive: the covered pixels are rewritten before export, never layered on top.
// Blur and mosaic are deliberately strong (coarse blocks plus noise) so they cannot be undone.
import type { Rect, Zone } from './types.ts';

export const MASK_COLOR = '#0b0d10';
export const MOSAIC_BLOCK = 20;
export const MOSAIC_NOISE = 24;
export const BLUR_NOISE = 6;
export type MaskStyle = 'blur' | 'mosaic' | 'opaque' | 'emoji';
export type Category = Zone['category'];
/** Style per zone category. Missing categories use the default. */
export type MaskStyles = Partial<Record<Category, MaskStyle>>;
export const DEFAULT_STYLE: MaskStyle = 'blur';
const CATEGORIES: Category[] = ['face', 'text', 'plate', 'person', 'manual'];
/** Styles offered for a category: emoji only makes sense on a face. */
export const stylesFor = (c: Category): MaskStyle[] =>
  c === 'face' ? ['blur', 'mosaic', 'opaque', 'emoji'] : ['blur', 'mosaic', 'opaque'];
export const EMOJIS = ['😎', '🙂', '😺', '🤖', '👽', '👶'];

export interface Ctx2D {
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  filter?: string;
  getImageData?(x: number, y: number, w: number, h: number): ImageData;
  putImageData?(data: ImageData, x: number, y: number): void;
  fillText?(text: string, x: number, y: number): void;
  font?: string;
  textAlign?: CanvasTextAlign;
  textBaseline?: CanvasTextBaseline;
}

const snap = (r: Rect) => {
  const x = Math.floor(r.x);
  const y = Math.floor(r.y);
  return { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y };
};

/** Replaces every `block` px square by its mean colour, then adds uniform noise in +-`noise`. */
function blocks(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  block: number,
  noise: number,
  random: () => number,
): void {
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const ex = Math.min(w, bx + block);
      const ey = Math.min(h, by + block);
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          n++;
        }
      }
      const mean = [r / n, g / n, b / n];
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) data[i + c] = mean[c]! + (random() * 2 - 1) * noise;
          data[i + 3] = 255;
        }
      }
    }
  }
}

/**
 * Mosaic in place: each 20 px block becomes its mean colour, then every pixel gets independent
 * uniform noise in +-24, so neither the block means nor the detail can be recovered exactly.
 */
export function mosaic(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  random: () => number = Math.random,
): void {
  blocks(data, w, h, MOSAIC_BLOCK, MOSAIC_NOISE, random);
}

/** Blur radius for a zone: scales with the zone so large text is as unreadable as small text. */
export const blurRadius = (w: number, h: number) => Math.max(6, Math.min(80, Math.round(Math.min(w, h) / 5)));

/** One box blur pass along rows or columns of an RGB float buffer, edges clamped. */
function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, rows: boolean) {
  const len = rows ? w : h;
  const lines = rows ? h : w;
  const k = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const idx = (p: number) => {
      const q = p < 0 ? 0 : p >= len ? len - 1 : p;
      return (rows ? l * w + q : q * w + l) * 3;
    };
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let p = -r; p <= r; p++) sum += src[idx(p) + c]!;
      for (let p = 0; p < len; p++) {
        dst[idx(p) + c] = sum * k;
        sum += src[idx(p + r + 1) + c]! - src[idx(p - r) + c]!;
      }
    }
  }
}

/**
 * Blur in place. The zone is first reduced to coarse blocks (the detail is thrown away, not
 * just smoothed, so no deconvolution can bring it back), then box blurred three times (close to
 * a gaussian) and given light noise.
 */
export function blur(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  random: () => number = Math.random,
  r = blurRadius(w, h),
): void {
  blocks(data, w, h, r, 0, random);
  const a = new Float32Array(w * h * 3);
  const b = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    a[j] = data[i]!;
    a[j + 1] = data[i + 1]!;
    a[j + 2] = data[i + 2]!;
  }
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, w, h, r, true);
    boxPass(b, a, w, h, r, false);
  }
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    for (let c = 0; c < 3; c++) data[i + c] = a[j + c]! + (random() * 2 - 1) * BLUR_NOISE;
    data[i + 3] = 255;
  }
}

const pixels = (ctx: Ctx2D) => !!(ctx.getImageData && ctx.putImageData);
/** True when a style reads pixels back, so the canvas should be created for frequent reads. */
export const readsPixels = (styles: MaskStyle | MaskStyles) =>
  typeof styles === 'string'
    ? styles !== 'opaque'
    : CATEGORIES.some((c) => (styles[c] ?? DEFAULT_STYLE) !== 'opaque');

/**
 * Faces are covered by an ellipse. It is this much larger than the ellipse inscribed in the face
 * box, so it also reaches most of the box corners (cheeks, jaw, hairline).
 */
export const FACE_ELLIPSE = 1.2;
/** Blur fades out over this fraction of the zone's smaller side, outside the zone: soft edges
 * without ever revealing anything inside the zone. */
export const BLUR_FEATHER = 0.35;

export type Shape =
  { kind: 'rect'; r: Rect } | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

export const shapeOf = (z: Zone): Shape => {
  const r = z.rect;
  return z.category === 'face'
    ? {
        kind: 'ellipse',
        cx: r.x + r.w / 2,
        cy: r.y + r.h / 2,
        rx: (r.w / 2) * FACE_ELLIPSE,
        ry: (r.h / 2) * FACE_ELLIPSE,
      }
    : { kind: 'rect', r: snap(r) }; // partly covered pixels count as covered
};

const bounds = (s: Shape): Rect =>
  s.kind === 'rect' ? s.r : { x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 };

/**
 * How much of the mask applies at a pixel centre: 1 inside the shape, then 0 outside. With a
 * feather, it fades out smoothly over `feather` px outside the shape. Ellipse edges are
 * anti-aliased over one pixel.
 */
export function coverage(px: number, py: number, s: Shape, feather: number): number {
  let d: number;
  if (s.kind === 'ellipse') {
    const k = Math.hypot((px - s.cx) / s.rx, (py - s.cy) / s.ry);
    d = (k - 1) * Math.min(s.rx, s.ry);
  } else {
    const dx = Math.max(s.r.x - px, px - (s.r.x + s.r.w), 0);
    const dy = Math.max(s.r.y - py, py - (s.r.y + s.r.h), 0);
    d = Math.hypot(dx, dy);
  }
  if (d <= 0) return 1;
  if (feather <= 0) return s.kind === 'ellipse' && d < 1 ? 1 - d : 0;
  const t = Math.min(1, d / feather);
  return 1 - t * t * (3 - 2 * t);
}

/** Draw the image at output size, then cover every selected zone (coordinates in output pixels). */
export function renderCloak(
  ctx: Ctx2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  zones: Zone[],
  styles: MaskStyle | MaskStyles = DEFAULT_STYLE,
): void {
  if ('filter' in ctx) ctx.filter = 'none';
  ctx.drawImage(image, 0, 0, width, height);
  let faces = 0;
  for (const z of zones) {
    if (!z.selected) continue;
    if (z.rect.w <= 0 || z.rect.h <= 0) continue;
    let style = (typeof styles === 'string' ? styles : styles[z.category]) ?? DEFAULT_STYLE;
    if (style === 'emoji' && z.category !== 'face') style = DEFAULT_STYLE;
    if (!pixels(ctx)) {
      // No pixel access: a plain solid box is the only safe fallback.
      const r = snap(z.rect);
      ctx.fillStyle = MASK_COLOR;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      continue;
    }
    const shape = shapeOf(z);
    const soft = style === 'blur' || style === 'emoji';
    const feather = soft ? Math.max(4, Math.min(z.rect.w, z.rect.h) * BLUR_FEATHER) : 0;
    const b = bounds(shape);
    const area = snap({
      x: b.x - feather - 1,
      y: b.y - feather - 1,
      w: b.w + 2 * feather + 2,
      h: b.h + 2 * feather + 2,
    });
    const x0 = Math.max(0, area.x);
    const y0 = Math.max(0, area.y);
    const w = Math.min(width, area.x + area.w) - x0;
    const h = Math.min(height, area.y + area.h) - y0;
    if (w <= 0 || h <= 0) continue;
    const img = ctx.getImageData!(x0, y0, w, h);
    const orig = img.data.slice();
    if (style === 'mosaic') mosaic(img.data, w, h);
    else if (style === 'opaque') {
      for (let i = 0; i < img.data.length; i += 4) img.data.set([0x0b, 0x0d, 0x10, 255], i);
    } else blur(img.data, w, h, Math.random, blurRadius(z.rect.w, z.rect.h));
    // Blend the masked pixels into the original by coverage.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = coverage(x0 + x + 0.5, y0 + y + 0.5, shape, feather);
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) img.data[i + c] = orig[i + c]! * (1 - a) + img.data[i + c]! * a;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData!(img, x0, y0);
    // Emoji sits on a blurred face: if the emoji font is missing, the face is still gone.
    if (style === 'emoji' && ctx.fillText && shape.kind === 'ellipse') {
      const size = Math.max(shape.rx, shape.ry) * 2.1;
      ctx.font = `${Math.round(size)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(EMOJIS[faces % EMOJIS.length]!, shape.cx, shape.cy + size * 0.04);
    }
    if (z.category === 'face') faces++;
  }
}
