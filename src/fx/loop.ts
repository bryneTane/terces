// One requestAnimationFrame loop for every effect, paused while the page is hidden.
export type FrameFn = (now: number, dt: number) => void;

export interface LoopDeps {
  raf: (cb: FrameRequestCallback) => number;
  caf: (id: number) => void;
  doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
}

const defaultDeps = (): LoopDeps => ({
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  doc: document,
});

export class FrameLoop {
  private fns = new Set<FrameFn>();
  private id: number | null = null;
  private last: number | null = null;
  private deps: LoopDeps;

  constructor(deps: LoopDeps = defaultDeps()) {
    this.deps = deps;
    this.deps.doc.addEventListener('visibilitychange', this.onVisibility);
  }

  add(fn: FrameFn): () => void {
    this.fns.add(fn);
    this.start();
    return () => {
      this.fns.delete(fn);
      if (!this.fns.size) this.stop();
    };
  }

  get running() {
    return this.id !== null;
  }

  dispose() {
    this.stop();
    this.fns.clear();
    this.deps.doc.removeEventListener('visibilitychange', this.onVisibility);
  }

  private start() {
    if (this.id !== null || this.deps.doc.hidden || !this.fns.size) return;
    this.last = null;
    this.id = this.deps.raf(this.tick);
  }

  private stop() {
    if (this.id !== null) this.deps.caf(this.id);
    this.id = null;
  }

  private tick = (now: number) => {
    const dt = this.last === null ? 16.7 : now - this.last;
    this.last = now;
    for (const fn of this.fns) fn(now, dt);
    this.id = this.fns.size && !this.deps.doc.hidden ? this.deps.raf(this.tick) : null;
  };

  private onVisibility = () => (this.deps.doc.hidden ? this.stop() : this.start());
}

let shared: FrameLoop | null = null;
export const frameLoop = () => (shared ??= new FrameLoop());
