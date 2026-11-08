// Test helpers: real ONNX models through onnxruntime-node, images through @napi-rs/canvas.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as ort from 'onnxruntime-node';
import type { ImageSource, Runner, TensorLike } from '../../src/worker/models/common.ts';

export async function imageSource(path: string): Promise<ImageSource> {
  const img = await loadImage(path);
  return {
    width: img.width,
    height: img.height,
    pixels(sx, sy, sw, sh, dw, dh) {
      const c = createCanvas(dw, dh);
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      const d = c.getContext('2d').getImageData(0, 0, dw, dh);
      return { data: d.data as unknown as Uint8ClampedArray, width: dw, height: dh };
    },
    rotated(t, dw, dh) {
      const c = createCanvas(dw, dh);
      const ctx = c.getContext('2d');
      ctx.setTransform(dw / t.len, 0, 0, dh / t.thick, dw / 2, dh / 2);
      ctx.rotate(-t.angle);
      ctx.translate(-t.cx, -t.cy);
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, dw, dh);
      return { data: d.data as unknown as Uint8ClampedArray, width: dw, height: dh };
    },
  };
}

export async function runner(model: string): Promise<Runner> {
  const session = await ort.InferenceSession.create(`public/models/${model}`, { logSeverityLevel: 3 });
  return async (feeds) => {
    const tensors = Object.fromEntries(
      Object.entries(feeds).map(([k, v]) => [
        k,
        new ort.Tensor('float32', v.data as Float32Array, v.dims as number[]),
      ]),
    );
    return (await session.run(tensors)) as unknown as Record<string, TensorLike>;
  };
}
