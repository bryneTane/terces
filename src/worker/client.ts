// Main-thread wrapper around the inference worker. Drops messages for stale sessions.
import type { Backend, FromWorker, ScanCategory, ToWorker } from './protocol.ts';

export interface WorkerLike {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (ev: MessageEvent<FromWorker>) => void): void;
  terminate(): void;
}

export type Listener = (message: FromWorker) => void;

export function createInferenceWorker(): WorkerLike {
  return new Worker(new URL('./inference.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}

export class InferenceClient {
  private listeners = new Set<Listener>();
  private current: string | null = null;

  constructor(private worker: WorkerLike) {
    worker.addEventListener('message', (ev) => this.receive(ev.data));
  }

  init(prefer: Backend = 'webgpu') {
    this.worker.postMessage({ type: 'init', prefer });
  }

  /** Starts a scan; the bitmap is transferred (unusable on the main thread afterwards). */
  scan(sessionId: string, bitmap: ImageBitmap, categories: ScanCategory[]) {
    if (this.current && this.current !== sessionId) this.cancel(this.current);
    this.current = sessionId;
    this.worker.postMessage({ type: 'scan', sessionId, bitmap, categories }, [bitmap]);
  }

  cancel(sessionId: string) {
    this.worker.postMessage({ type: 'cancel', sessionId });
    if (this.current === sessionId) this.current = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  terminate() {
    this.worker.terminate();
    this.listeners.clear();
  }

  private receive(message: FromWorker) {
    const id = 'sessionId' in message ? message.sessionId : undefined;
    if (id !== undefined && id !== this.current) return;
    if (message.type === 'done' && id === this.current) this.current = null;
    for (const l of this.listeners) l(message);
  }
}
