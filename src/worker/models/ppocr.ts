// PP-OCRv5 mobile text detection (DB) and Latin recognition (CTC).
import type { Rect } from '../../lib/types.ts';
import {
  clampRect,
  toCHW,
  type ImageSource,
  type Pixels,
  type Runner,
  type Scored,
  type TensorLike,
  type Tilt,
} from './common.ts';

/** Longest side the detector sees. Small images are scaled up to it too: on the eval set, text
 * coverage goes from 68% at 960 px to 79% at 1600 px (pnpm eval). */
export const DET_LIMIT = 1600;
export const DET_THRESH = 0.3;
export const DET_BOX_THRESH = 0.5;
/** Box growth around the detected core; 2.0 covers word edges better than PaddleOCR's 1.5. */
export const DET_UNCLIP = 2.0;
export const DET_MIN_SIDE = 3;
/** Text tilted less than this (degrees) is read from its straight box. */
export const TILT_MIN_DEG = 4;
/** Regions must be at least this much longer than thick for their angle to mean anything. */
export const TILT_MIN_ELONGATION = 1.5;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export function detSize(width: number, height: number, limit = DET_LIMIT) {
  const ratio = limit / Math.max(width, height);
  const round = (v: number) => Math.max(32, Math.round((v * ratio) / 32) * 32);
  return { w: round(width), h: round(height) };
}

export function detInput(src: ImageSource) {
  const { w, h } = detSize(src.width, src.height);
  const px = src.pixels(0, 0, src.width, src.height, w, h);
  // PaddleOCR reads BGR and applies mean/std in channel order.
  const data = toCHW(px, 'bgr', (v, c) => (v / 255 - MEAN[c]!) / STD[c]!);
  return { tensor: { data, dims: [1, 3, h, w] } as TensorLike, w, h };
}

/** DB post-processing on the probability map: connected components, score, unclip, rescale. */
export function dbPostprocess(
  prob: Float32Array,
  mapW: number,
  mapH: number,
  scaleX: number,
  scaleY: number,
  srcW: number,
  srcH: number,
): Scored[] {
  const labels = new Int32Array(mapW * mapH);
  const boxes: Scored[] = [];
  const stack: number[] = [];
  const region: number[] = [];
  let next = 0;
  for (let start = 0; start < prob.length; start++) {
    if (labels[start] !== 0 || prob[start]! <= DET_THRESH) continue;
    next++;
    let minX = mapW,
      minY = mapH,
      maxX = 0,
      maxY = 0,
      sum = 0,
      n = 0;
    stack.push(start);
    labels[start] = next;
    region.length = 0;
    while (stack.length) {
      const p = stack.pop()!;
      region.push(p);
      const x = p % mapW;
      const y = (p - x) / mapW;
      sum += prob[p]!;
      n++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbours = [
        x > 0 ? p - 1 : -1,
        x < mapW - 1 ? p + 1 : -1,
        y > 0 ? p - mapW : -1,
        y < mapH - 1 ? p + mapW : -1,
      ];
      for (const q of neighbours) {
        if (q >= 0 && labels[q] === 0 && prob[q]! > DET_THRESH) {
          labels[q] = next;
          stack.push(q);
        }
      }
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (Math.min(w, h) < DET_MIN_SIDE) continue;
    const score = sum / n;
    if (score < DET_BOX_THRESH) continue;
    const d = (w * h * DET_UNCLIP) / (2 * (w + h));
    const r: Rect = {
      x: (minX - d) * scaleX,
      y: (minY - d) * scaleY,
      w: (w + 2 * d) * scaleX,
      h: (h + 2 * d) * scaleY,
    };
    const tilt = tiltOf(region, mapW, scaleX, scaleY);
    boxes.push({ ...clampRect(r, srcW, srcH), score, ...(tilt ? { tilt } : {}) });
  }
  return boxes;
}

/**
 * The region (map pixel indices) as a rotated rectangle in source pixels, from its principal
 * axis, grown like the straight box (PaddleOCR reads tilted text from such a rectangle). Null
 * when the text is level or vertical, or the region too round for its angle to mean anything.
 */
export function tiltOf(region: readonly number[], mapW: number, scaleX: number, scaleY: number): Tilt | null {
  const n = region.length;
  if (n < 2) return null;
  let mx = 0,
    my = 0;
  for (const p of region) {
    mx += ((p % mapW) + 0.5) * scaleX;
    my += (Math.floor(p / mapW) + 0.5) * scaleY;
  }
  mx /= n;
  my /= n;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of region) {
    const dx = ((p % mapW) + 0.5) * scaleX - mx;
    const dy = (Math.floor(p / mapW) + 0.5) * scaleY - my;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const deg = Math.abs((angle * 180) / Math.PI);
  if (deg < TILT_MIN_DEG || deg > 90 - TILT_MIN_DEG) return null;
  const [ux, uy, vx, vy] = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle)];
  let u0 = Infinity,
    u1 = -Infinity,
    v0 = Infinity,
    v1 = -Infinity;
  for (const p of region) {
    const dx = ((p % mapW) + 0.5) * scaleX - mx;
    const dy = (Math.floor(p / mapW) + 0.5) * scaleY - my;
    const u = dx * ux + dy * uy;
    const v = dx * vx + dy * vy;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  const cell = Math.max(scaleX, scaleY);
  let len = u1 - u0 + cell;
  let thick = v1 - v0 + cell;
  if (len < TILT_MIN_ELONGATION * thick) return null;
  const d = (len * thick * DET_UNCLIP) / (2 * (len + thick));
  len += 2 * d;
  thick += 2 * d;
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  return { cx: mx + cu * ux + cv * vx, cy: my + cu * uy + cv * vy, len, thick, angle };
}

export async function detectText(src: ImageSource, run: Runner): Promise<Scored[]> {
  const { tensor, w, h } = detInput(src);
  const out = await run({ x: tensor });
  const map = Object.values(out)[0]!;
  const [, , mh = h, mw = w] = map.dims;
  return dbPostprocess(
    map.data as Float32Array,
    mw,
    mh,
    src.width / mw,
    src.height / mh,
    src.width,
    src.height,
  );
}

// ---- Recognition (PP-OCRv5 Latin, CTC) ----

export const REC_HEIGHT = 48;
export const REC_MAX_WIDTH = 1280;
export const REC_MAX_BOXES = 40;

/** Width at height 48 keeping aspect, rounded up to a multiple of 8 and capped. */
export function recWidth(w: number, h: number): number {
  return Math.min(REC_MAX_WIDTH, Math.max(8, Math.ceil((REC_HEIGHT * w) / Math.max(1, h) / 8) * 8));
}

/** A detected text box, with its rotated rectangle when the text is tilted. */
export type TextBox = Rect & { tilt?: Tilt };

/** Tall boxes hold vertical text, read after turning it horizontal. */
export const isVertical = (box: Rect) => box.h > 1.5 * box.w;

/**
 * Crop a box to a 1x3x48xW tensor, BGR, (v/255 - 0.5)/0.5. Vertical boxes are rotated to
 * horizontal: counter-clockwise (text that runs bottom to top), or clockwise when `clockwise`.
 * `mirror` flips the crop left to right first (text seen in a mirror).
 */
export function recInput(src: ImageSource, box: TextBox, clockwise = false, mirror = false): TensorLike {
  if (box.tilt && src.rotated) {
    // Tilted text: read the region turned level (its own rotated rectangle).
    const W = recWidth(box.tilt.len, box.tilt.thick);
    let px = src.rotated(box.tilt, W, REC_HEIGHT);
    if (mirror) px = flipX(px);
    return { data: toCHW(px, 'bgr', (v) => (v / 255 - 0.5) / 0.5), dims: [1, 3, REC_HEIGHT, W] };
  }
  const rotate = isVertical(box);
  const [bw, bh] = rotate ? [box.h, box.w] : [box.w, box.h];
  const W = recWidth(bw, bh);
  let px = rotate
    ? src.pixels(box.x, box.y, box.w, box.h, REC_HEIGHT, W)
    : src.pixels(box.x, box.y, box.w, box.h, W, REC_HEIGHT);
  if (mirror) px = flipX(px);
  if (rotate) px = rotate90(px);
  if (rotate && clockwise) px = rotate180(px);
  return { data: toCHW(px, 'bgr', (v) => (v / 255 - 0.5) / 0.5), dims: [1, 3, REC_HEIGHT, W] };
}

/** Flip RGBA pixels left to right. */
export function flipX(px: Pixels): Pixels {
  const { width: w, height: h, data } = px;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      out.set(data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (y * w + (w - 1 - x)) * 4);
  return { data: out, width: w, height: h };
}

/** Rotate RGBA pixels by 180 degrees. */
export function rotate180(px: Pixels): Pixels {
  const n = px.width * px.height;
  const out = new Uint8ClampedArray(px.data.length);
  for (let i = 0; i < n; i++) out.set(px.data.subarray(i * 4, i * 4 + 4), (n - 1 - i) * 4);
  return { data: out, width: px.width, height: px.height };
}

/** Rotate RGBA pixels 90 degrees counter-clockwise (vertical text read bottom to top, as PaddleOCR does). */
export function rotate90(px: Pixels): Pixels {
  const { width: w, height: h, data } = px;
  const out = new Uint8ClampedArray(data.length);
  // output is h wide, w tall: out(x', y') = in(x = w - 1 - y', y = x')
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = ((w - 1 - x) * h + y) * 4;
      const i = (y * w + x) * 4;
      out[o] = data[i]!;
      out[o + 1] = data[i + 1]!;
      out[o + 2] = data[i + 2]!;
      out[o + 3] = data[i + 3]!;
    }
  }
  return { data: out, width: h, height: w };
}

/**
 * Greedy CTC decode of [T, C] probabilities. Class 0 is the blank, class k (1..dict.length) is
 * dict[k-1], and the last class is a space. Returns the text and the mean probability of kept steps.
 */
export function ctcDecode(
  probs: Float32Array,
  steps: number,
  classes: number,
  dict: readonly string[],
): { text: string; score: number } {
  let text = '';
  let sum = 0;
  let n = 0;
  let prev = -1;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestP = -Infinity;
    const row = t * classes;
    for (let c = 0; c < classes; c++) {
      const p = probs[row + c]!;
      if (p > bestP) {
        bestP = p;
        best = c;
      }
    }
    if (best !== 0 && best !== prev) {
      text += best <= dict.length ? dict[best - 1]! : ' ';
      sum += bestP;
      n++;
    }
    prev = best;
  }
  return { text: text.replace(/\s+/g, ' ').trim(), score: n ? sum / n : 0 };
}

/** The `limit` largest boxes, the order PaddleOCR-style UIs read most useful text first. */
export function largest<T extends Rect>(boxes: T[], limit = REC_MAX_BOXES): T[] {
  return [...boxes].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, limit);
}

/**
 * One reader's reading of a box: text and mean probability, with no threshold (which reading
 * counts is decided across readers, see readers.ts). Null for boxes too small to read.
 */
export async function recognizeText(
  src: ImageSource,
  box: TextBox,
  run: Runner,
  dict: readonly string[],
  mirror = false,
): Promise<{ text: string; score: number } | null> {
  if (box.w < 2 || box.h < 2) return null;
  const read = async (clockwise: boolean) => {
    const out = await run({ x: recInput(src, box, clockwise, mirror) });
    const t = Object.values(out)[0]!;
    const [, steps = 0, classes = 0] = t.dims;
    return ctcDecode(t.data as Float32Array, steps, classes, dict);
  };
  const a = await read(false);
  // Tilted text is read from its own rotated rectangle, once.
  if (!isVertical(box) || (box.tilt && src.rotated)) return a;
  // Vertical text runs either way (labels top to bottom, spines bottom to top): keep the surer reading.
  const b = await read(true);
  return b.score > a.score ? b : a;
}

/**
 * One reader's readings of many boxes, in the same order (null for boxes too small to read).
 * Boxes are read one at a time: batching them (padded to a common width) was slower in the
 * browser on the eval set (1290 against 1166 ms per photo) and changed some readings.
 */
export async function readTexts(
  src: ImageSource,
  boxes: TextBox[],
  run: Runner,
  dict: readonly string[],
  mirror = false,
): Promise<({ text: string; score: number } | null)[]> {
  const out: ({ text: string; score: number } | null)[] = [];
  for (const box of boxes) out.push(await recognizeText(src, box, run, dict, mirror));
  return out;
}
