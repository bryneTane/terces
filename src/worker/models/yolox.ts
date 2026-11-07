// YOLOX-Nano (Megvii 0.1.1rc0 ONNX): 416x416 BGR, raw 0-255 values, top-left letterbox padded 114.
// Output [1, 3549, 85]: per anchor (x, y, w, h, obj, 80 class scores), grid not yet applied.
import type { Rect } from '../../lib/types.ts';
import {
  clampRect,
  letterboxScale,
  nms,
  toCHW,
  type ImageSource,
  type Runner,
  type Scored,
  type TensorLike,
} from './common.ts';

export const YOLOX_SIZE = 416;
export const YOLOX_SCORE = 0.45;
export const YOLOX_NMS = 0.45;
const PAD = 114;
const STRIDES = [8, 16, 32] as const;

/** COCO class index -> kept label. Everything else is ignored. */
export const YOLOX_CLASSES: Record<number, { label: string; category: 'person' | 'vehicle' }> = {
  0: { label: 'person', category: 'person' },
  2: { label: 'car', category: 'vehicle' },
  3: { label: 'motorcycle', category: 'vehicle' },
  5: { label: 'bus', category: 'vehicle' },
  7: { label: 'truck', category: 'vehicle' },
};

export interface ObjectDetection {
  category: 'person' | 'vehicle';
  label: string;
  box: Rect;
  score: number;
}

export function yoloxInput(src: ImageSource) {
  const scale = letterboxScale(src.width, src.height, YOLOX_SIZE);
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const px = src.pixels(0, 0, src.width, src.height, dw, dh);
  const plane = YOLOX_SIZE * YOLOX_SIZE;
  const data = new Float32Array(3 * plane).fill(PAD);
  const chw = toCHW(px, 'bgr', (v) => v);
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < dh; y++)
      data.set(chw.subarray(c * dw * dh + y * dw, c * dw * dh + (y + 1) * dw), c * plane + y * YOLOX_SIZE);
  return { tensor: { data, dims: [1, 3, YOLOX_SIZE, YOLOX_SIZE] } as TensorLike, scale };
}

/** Grid decode, class filter, score threshold, class-wise NMS, mapped to source pixels. */
export function yoloxDecode(
  out: TensorLike,
  scale: number,
  width: number,
  height: number,
  threshold = YOLOX_SCORE,
): ObjectDetection[] {
  const d = out.data as Float32Array;
  const n = out.dims[2] ?? 85;
  const byClass = new Map<number, (Scored & { cls: number })[]>();
  let i = 0;
  for (const s of STRIDES) {
    const cols = YOLOX_SIZE / s;
    for (let gy = 0; gy < cols; gy++)
      for (let gx = 0; gx < cols; gx++, i++) {
        const o = i * n;
        const obj = d[o + 4]!;
        if (obj < threshold) continue;
        for (const k of Object.keys(YOLOX_CLASSES)) {
          const cls = Number(k);
          const score = obj * d[o + 5 + cls]!;
          if (score < threshold) continue;
          const cx = (d[o]! + gx) * s;
          const cy = (d[o + 1]! + gy) * s;
          const w = Math.exp(d[o + 2]!) * s;
          const h = Math.exp(d[o + 3]!) * s;
          const list = byClass.get(cls) ?? [];
          list.push({
            x: (cx - w / 2) / scale,
            y: (cy - h / 2) / scale,
            w: w / scale,
            h: h / scale,
            score,
            cls,
          });
          byClass.set(cls, list);
        }
      }
  }
  const outList: ObjectDetection[] = [];
  for (const [cls, boxes] of byClass) {
    const meta = YOLOX_CLASSES[cls]!;
    for (const b of nms(boxes, YOLOX_NMS)) {
      const box = clampRect(b, width, height);
      if (box.w > 0 && box.h > 0)
        outList.push({ category: meta.category, label: meta.label, box, score: b.score });
    }
  }
  return outList.sort((a, b) => b.score - a.score);
}

export async function detectObjects(src: ImageSource, run: Runner): Promise<ObjectDetection[]> {
  const { tensor, scale } = yoloxInput(src);
  const out = await run({ images: tensor });
  return yoloxDecode(out['output'] ?? Object.values(out)[0]!, scale, src.width, src.height);
}
