// YuNet face detector (OpenCV Zoo 2023mar, fixed 640x640 BGR float input, not normalized).
import type { Rect } from '../../lib/types.ts';
import {
  letterboxScale,
  nms,
  tiles,
  toCHW,
  type ImageSource,
  type Runner,
  type Scored,
  type TensorLike,
} from './common.ts';

export const YUNET_SIZE = 640;
// 0.6 (plan) let a clasped-hands false positive through at 0.647 on group-faces.jpg; real faces score ~0.93.
export const YUNET_SCORE = 0.7;
export const YUNET_NMS = 0.3;
const STRIDES = [8, 16, 32] as const;

/** Prepare one 640x640 input from a source region (letterboxed, top-left anchored). */
export function yunetInput(src: ImageSource, region: Rect) {
  const scale = letterboxScale(region.w, region.h, YUNET_SIZE);
  const dw = Math.max(1, Math.round(region.w * scale));
  const dh = Math.max(1, Math.round(region.h * scale));
  const px = src.pixels(region.x, region.y, region.w, region.h, dw, dh);
  const data = new Float32Array(3 * YUNET_SIZE * YUNET_SIZE);
  const plane = YUNET_SIZE * YUNET_SIZE;
  const chw = toCHW(px, 'bgr', (v) => v);
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < dh; y++)
      data.set(chw.subarray(c * dw * dh + y * dw, c * dw * dh + (y + 1) * dw), c * plane + y * YUNET_SIZE);
  return { tensor: { data, dims: [1, 3, YUNET_SIZE, YUNET_SIZE] } as TensorLike, scale };
}

/** Decode YuNet outputs into boxes in source coordinates. */
export function yunetDecode(
  out: Record<string, TensorLike>,
  region: Rect,
  scale: number,
  threshold = YUNET_SCORE,
): Scored[] {
  const boxes: Scored[] = [];
  for (const s of STRIDES) {
    const cls = out[`cls_${s}`]!.data as Float32Array;
    const obj = out[`obj_${s}`]!.data as Float32Array;
    const bbox = out[`bbox_${s}`]!.data as Float32Array;
    const cols = YUNET_SIZE / s;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i]!)) * Math.min(1, Math.max(0, obj[i]!)));
      if (score < threshold) continue;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cx = (c + bbox[i * 4]!) * s;
      const cy = (r + bbox[i * 4 + 1]!) * s;
      const w = Math.exp(bbox[i * 4 + 2]!) * s;
      const h = Math.exp(bbox[i * 4 + 3]!) * s;
      boxes.push({
        x: region.x + (cx - w / 2) / scale,
        y: region.y + (cy - h / 2) / scale,
        w: w / scale,
        h: h / scale,
        score,
      });
    }
  }
  return boxes;
}

/** Regions to scan: the whole image, plus overlapping tiles for large images (small faces). */
export function yunetRegions(width: number, height: number): Rect[] {
  const whole = { x: 0, y: 0, w: width, h: height };
  if (Math.max(width, height) <= 1280) return [whole];
  return [whole, ...tiles(width, height, 960, 160)];
}

export async function detectFaces(
  src: ImageSource,
  run: Runner,
  cancelled: () => boolean = () => false,
): Promise<Scored[]> {
  const all: Scored[] = [];
  for (const region of yunetRegions(src.width, src.height)) {
    if (cancelled()) break;
    const { tensor, scale } = yunetInput(src, region);
    all.push(...yunetDecode(await run({ input: tensor }), region, scale));
  }
  return nms(all, YUNET_NMS);
}
