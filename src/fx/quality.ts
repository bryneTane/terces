// Effect quality tiers and the frame-time governor.
export type Tier = 'high' | 'medium' | 'low' | 'static';
export const TIERS: Tier[] = ['high', 'medium', 'low', 'static'];

export const BUDGET_MS = 20;
export const WINDOW_MS = 1000;

export interface Env {
  webgl2: boolean;
  reducedMotion: boolean;
}

export function detectEnv(): Env {
  let webgl2: boolean;
  try {
    webgl2 = typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2');
  } catch {
    webgl2 = false;
  }
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { webgl2, reducedMotion };
}

export function initialTier(env: Env): Tier {
  return !env.webgl2 || env.reducedMotion ? 'static' : 'high';
}

const p90 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] ?? 0;
};

/**
 * Starts at `high` (or `static`), drops one tier when the rolling p90 frame time stays over
 * 20 ms for 1 s, never climbs back within a session, and caps at `medium` while inference runs.
 * `static` is terminal: the governor never animates a static device.
 */
export class QualityGovernor {
  private base: Tier;
  private frames: { t: number; dt: number }[] = [];
  private overSince: number | null = null;
  private inferring = false;
  private listeners = new Set<(t: Tier) => void>();

  constructor(env: Env) {
    this.base = initialTier(env);
  }

  get tier(): Tier {
    if (this.inferring && this.base === 'high') return 'medium';
    return this.base;
  }

  subscribe(fn: (t: Tier) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  setInferring(on: boolean) {
    const before = this.tier;
    this.inferring = on;
    if (this.tier !== before) this.notify();
  }

  setReducedMotion(on: boolean) {
    if (on && this.base !== 'static') {
      this.base = 'static';
      this.notify();
    }
  }

  /** Record one frame (`now` and its duration, ms). */
  frame(now: number, dt: number) {
    if (this.base === 'static') return;
    this.frames.push({ t: now, dt });
    while (this.frames.length && this.frames[0]!.t < now - WINDOW_MS) this.frames.shift();
    if (p90(this.frames.map((f) => f.dt)) > BUDGET_MS) {
      this.overSince ??= now;
      if (now - this.overSince >= WINDOW_MS) this.drop();
    } else this.overSince = null;
  }

  private drop() {
    const i = TIERS.indexOf(this.tier);
    this.base = TIERS[Math.min(TIERS.length - 1, i + 1)]!;
    this.frames = [];
    this.overSince = null;
    this.notify();
  }

  private notify() {
    for (const fn of this.listeners) fn(this.tier);
  }
}
