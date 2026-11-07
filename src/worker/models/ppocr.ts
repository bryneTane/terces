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
} from './common.ts';

export const DET_LIMIT = 960;
export const DET_THRESH = 0.3;
export const DET_BOX_THRESH = 0.5;
export const DET_UNCLIP = 1.6;
export const DET_MIN_SIDE = 3;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export function detSize(width: number, height: number, limit = DET_LIMIT) {
  const ratio = Math.max(width, height) > limit ? limit / Math.max(width, height) : 1;
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
    while (stack.length) {
      const p = stack.pop()!;
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
    boxes.push({ ...clampRect(r, srcW, srcH), score });
  }
  return boxes;
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
/** Mean probability below which a decoded line is treated as noise and left unread. */
export const REC_MIN_SCORE = 0.5;

/** Width at height 48 keeping aspect, rounded up to a multiple of 8 and capped. */
export function recWidth(w: number, h: number): number {
  return Math.min(REC_MAX_WIDTH, Math.max(8, Math.ceil((REC_HEIGHT * w) / Math.max(1, h) / 8) * 8));
}

/** Crop a box to a 1x3x48xW tensor, BGR, (v/255 - 0.5)/0.5. Tall boxes are rotated to horizontal. */
export function recInput(src: ImageSource, box: Rect): TensorLike {
  const rotate = box.h > 1.5 * box.w;
  const [bw, bh] = rotate ? [box.h, box.w] : [box.w, box.h];
  const W = recWidth(bw, bh);
  const px = rotate
    ? rotate90(src.pixels(box.x, box.y, box.w, box.h, REC_HEIGHT, W))
    : src.pixels(box.x, box.y, box.w, box.h, W, REC_HEIGHT);
  return { data: toCHW(px, 'bgr', (v) => (v / 255 - 0.5) / 0.5), dims: [1, 3, REC_HEIGHT, W] };
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

export async function recognizeText(
  src: ImageSource,
  box: Rect,
  run: Runner,
  dict: readonly string[],
): Promise<{ text: string; score: number } | null> {
  if (box.w < 2 || box.h < 2) return null;
  const out = await run({ x: recInput(src, box) });
  const t = Object.values(out)[0]!;
  const [, steps = 0, classes = 0] = t.dims;
  const r = ctcDecode(t.data as Float32Array, steps, classes, dict);
  return r.text && r.score >= REC_MIN_SCORE ? r : null;
}
