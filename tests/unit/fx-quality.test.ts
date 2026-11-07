import { describe, expect, it, vi } from 'vitest';
import { QualityGovernor, initialTier } from '../../src/fx/quality.ts';

const ok = { webgl2: true, reducedMotion: false };
function feed(g: QualityGovernor, from: number, ms: number, dt: number) {
  for (let t = from; t <= from + ms; t += dt) g.frame(t, dt);
  return from + ms;
}

describe('quality governor', () => {
  it('starts high, static without WebGL2 or with reduced motion', () => {
    expect(initialTier(ok)).toBe('high');
    expect(initialTier({ webgl2: false, reducedMotion: false })).toBe('static');
    expect(initialTier({ webgl2: true, reducedMotion: true })).toBe('static');
  });

  it('keeps the tier while frames are fast', () => {
    const g = new QualityGovernor(ok);
    feed(g, 0, 5000, 16);
    expect(g.tier).toBe('high');
  });

  it('drops one tier after p90 > 20 ms for one second, then another', () => {
    const g = new QualityGovernor(ok);
    const on = vi.fn();
    g.subscribe(on);
    let t = feed(g, 0, 900, 30);
    expect(g.tier).toBe('high');
    t = feed(g, t, 300, 30);
    expect(g.tier).toBe('medium');
    feed(g, t, 1200, 30);
    expect(g.tier).toBe('low');
    expect(on.mock.calls.map((c) => c[0])).toEqual(['medium', 'low']);
  });

  it('a short spike does not drop the tier', () => {
    const g = new QualityGovernor(ok);
    const t = feed(g, 0, 100, 40);
    feed(g, t, 3000, 16);
    expect(g.tier).toBe('high');
  });

  it('caps at medium while inference runs', () => {
    const g = new QualityGovernor(ok);
    g.setInferring(true);
    expect(g.tier).toBe('medium');
    g.setInferring(false);
    expect(g.tier).toBe('high');
  });

  it('switching on reduced motion goes static and stays', () => {
    const g = new QualityGovernor(ok);
    g.setReducedMotion(true);
    feed(g, 0, 3000, 50);
    expect(g.tier).toBe('static');
  });
});
