/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web';
import type { FromWorker, ToWorker } from './protocol.ts';
import { ModelRuntime, type OrtLike } from './runtime.ts';
import { runScan } from './scan.ts';
import type { ImageSource, Runner, TensorLike } from './models/common.ts';

declare const self: DedicatedWorkerGlobalScope;

const post = (m: FromWorker) => self.postMessage(m);
const runtime = new ModelRuntime(
  ort as unknown as OrtLike,
  (url) => fetch(url),
  { isolated: self.crossOriginIsolated, cores: navigator.hardwareConcurrency, hasWebGPU: 'gpu' in navigator },
  (stage, loaded, total) => post({ type: 'progress', stage, loaded, total }),
);
let ready: Promise<void> | null = null;
let dict: Promise<readonly string[]> | null = null;
const loadDict = () => {
  dict ??= runtime
    .file('ppocr-dict-latin', 'text-rec')
    .then((b) => JSON.parse(new TextDecoder().decode(b)) as string[]);
  dict.catch(() => (dict = null));
  return dict;
};
const cancelled = new Set<string>();

/** Pixel access on the transferred bitmap through a reusable OffscreenCanvas. */
function bitmapSource(bitmap: ImageBitmap): ImageSource {
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  return {
    width: bitmap.width,
    height: bitmap.height,
    pixels(sx, sy, sw, sh, dw, dh) {
      canvas.width = dw;
      canvas.height = dh;
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
      const d = ctx.getImageData(0, 0, dw, dh);
      return { data: d.data, width: dw, height: dh };
    },
  };
}

const runnerFor =
  (model: string, stage: Parameters<ModelRuntime['run']>[1]): Runner =>
  async (feeds) => {
    const tensors = Object.fromEntries(
      Object.entries(feeds).map(([k, v]) => [
        k,
        new ort.Tensor('float32', v.data as Float32Array, v.dims as number[]),
      ]),
    );
    return (await runtime.run(model, stage, tensors)) as Record<string, TensorLike>;
  };

function errorCode(e: unknown): 'model-load' | 'oom' | 'unknown' {
  if ((e as { code?: string })?.code === 'model-load') return 'model-load';
  if (e instanceof RangeError || /memory|allocation/i.test(String((e as Error)?.message))) return 'oom';
  return 'unknown';
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'init':
      ready ??= runtime
        .init(msg.prefer)
        .then(({ backend, threads }) => post({ type: 'ready', backend, threads }));
      try {
        await ready;
      } catch (e) {
        ready = null;
        post({ type: 'error', code: errorCode(e), message: String((e as Error)?.message ?? e) });
      }
      return;
    case 'cancel':
      cancelled.add(msg.sessionId);
      return;
    case 'scan': {
      const { sessionId, bitmap, categories } = msg;
      try {
        if (!ready) throw Object.assign(new Error('worker not initialised'), { code: 'model-load' });
        await ready;
        const ms = await runScan({
          source: bitmapSource(bitmap),
          runner: runnerFor,
          dict: loadDict,
          categories,
          emit: (finding) => post({ type: 'finding', sessionId, finding }),
          cancelled: () => cancelled.has(sessionId),
        });
        post({ type: 'done', sessionId, ms });
      } catch (e) {
        post({ type: 'error', sessionId, code: errorCode(e), message: String((e as Error)?.message ?? e) });
      } finally {
        bitmap.close();
        cancelled.delete(sessionId);
      }
    }
  }
};
