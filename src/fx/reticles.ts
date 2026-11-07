// Lock-on reticle states for streamed findings: acquire (bracket closes in), then lock.
import type { Rect } from '../lib/types.ts';

export const ACQUIRE_MS = 600;
export const ACQUIRE_SCALE = 1.35;

export type ReticlePhase = 'acquire' | 'lock';

export interface Reticle {
  id: string;
  rect: Rect;
  phase: ReticlePhase;
  /** Bracket scale around the box centre: ACQUIRE_SCALE -> 1. */
  scale: number;
  /** 0..1 fade-in. */
  alpha: number;
  alert: boolean;
}

const ease = (t: number) => 1 - (1 - t) ** 3;

export function reticleAt(id: string, rect: Rect, seenAt: number, now: number, alert: boolean): Reticle {
  const t = Math.max(0, Math.min(1, (now - seenAt) / ACQUIRE_MS));
  const e = ease(t);
  return {
    id,
    rect,
    phase: t >= 1 ? 'lock' : 'acquire',
    scale: ACQUIRE_SCALE - (ACQUIRE_SCALE - 1) * e,
    alpha: Math.min(1, t * 3),
    alert,
  };
}

/** Remembers when each finding id first appeared, so streamed updates do not restart its animation. */
export class SeenClock {
  private seen = new Map<string, number>();
  mark(ids: Iterable<string>, now: number) {
    for (const id of ids) if (!this.seen.has(id)) this.seen.set(id, now);
  }
  at(id: string): number | undefined {
    return this.seen.get(id);
  }
  reset() {
    this.seen.clear();
  }
}
