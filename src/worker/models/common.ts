// Shared helpers for model pre/post-processing. Environment-agnostic (worker and Node tests).
import type { Rect } from '../../lib/types.ts';

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Draws the source region (sx, sy, sw, sh) scaled to dw x dh and returns RGBA pixels. */
export interface ImageSource {
  width: number;
  height: number;
  pixels(sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): Pixels;
}

export interface TensorLike {
  data: Float32Array | Int32Array | BigInt64Array | Uint8Array;
  dims: readonly number[];
}

export type Runner = (feeds: Record<string, TensorLike>) => Promise<Record<string, TensorLike>>;

export interface Scored extends Rect {
  score: number;
}

export function iou(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function nms<T extends Scored>(boxes: T[], threshold: number): T[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: T[] = [];
  for (const b of sorted) if (keep.every((k) => iou(k, b) <= threshold)) keep.push(b);
  return keep;
}

export function clampRect(r: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(r.x, width));
  const y = Math.max(0, Math.min(r.y, height));
  return {
    x,
    y,
    w: Math.max(0, Math.min(r.x + r.w, width) - x),
    h: Math.max(0, Math.min(r.y + r.h, height) - y),
  };
}

/** Planar float tensor (NCHW) from RGBA pixels. `order` picks channel order; `norm` maps a 0..255 value per channel. */
export function toCHW(
  px: Pixels,
  order: 'rgb' | 'bgr',
  norm: (v: number, c: number) => number,
): Float32Array {
  const { data, width, height } = px;
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  const map = order === 'rgb' ? [0, 1, 2] : [2, 1, 0];
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = norm(data[i * 4 + map[c]!]!, c);
  }
  return out;
}

/** Letterbox: scale the whole image into size x size, anchored top-left, rest padded. */
export function letterboxScale(width: number, height: number, size: number): number {
  return Math.min(size / width, size / height);
}

/** Tiles covering the image, `tile` source pixels with `overlap`. */
export function tiles(width: number, height: number, tile: number, overlap: number): Rect[] {
  const step = tile - overlap;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = 0; ; x += step) {
    xs.push(Math.min(x, Math.max(0, width - tile)));
    if (x + tile >= width) break;
  }
  for (let y = 0; ; y += step) {
    ys.push(Math.min(y, Math.max(0, height - tile)));
    if (y + tile >= height) break;
  }
  return ys.flatMap((y) => xs.map((x) => ({ x, y, w: Math.min(tile, width), h: Math.min(tile, height) })));
}
