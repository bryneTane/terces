import { expect, it } from 'vitest';
import { ACQUIRE_MS, ACQUIRE_SCALE, SeenClock, reticleAt } from '../../src/fx/reticles.ts';

const r = { x: 0, y: 0, w: 10, h: 10 };

it('acquires, then locks after the acquire time', () => {
  const a = reticleAt('f', r, 1000, 1000, false);
  expect(a).toMatchObject({ phase: 'acquire', scale: ACQUIRE_SCALE, alpha: 0 });
  const mid = reticleAt('f', r, 1000, 1000 + ACQUIRE_MS / 2, false);
  expect(mid.phase).toBe('acquire');
  expect(mid.scale).toBeLessThan(ACQUIRE_SCALE);
  expect(mid.scale).toBeGreaterThan(1);
  expect(reticleAt('f', r, 1000, 1000 + ACQUIRE_MS, true)).toMatchObject({
    phase: 'lock',
    scale: 1,
    alpha: 1,
    alert: true,
  });
});

it('remembers first sight across streamed updates', () => {
  const c = new SeenClock();
  c.mark(['a'], 10);
  c.mark(['a', 'b'], 50);
  expect(c.at('a')).toBe(10);
  expect(c.at('b')).toBe(50);
});
