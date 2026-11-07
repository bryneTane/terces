import { describe, expect, it } from 'vitest';
import {
  addManualZone,
  findingsToZones,
  groupLines,
  hitTest,
  mergeText,
  pad,
  removeZone,
  resizeZone,
  toggleZone,
} from '../../src/lib/zones.ts';
import type { Zone } from '../../src/lib/types.ts';
import type { VisualFinding } from '../../src/lib/types.ts';

const f = (
  id: string,
  category: VisualFinding['category'],
  x: number,
  y: number,
  w = 100,
  h = 50,
): VisualFinding => ({
  id,
  category,
  box: { x, y, w, h },
  score: 0.9,
  source: 'ppocr',
});

describe('zones', () => {
  it('pads 8% per side and clamps to the image', () => {
    expect(pad({ x: 100, y: 100, w: 100, h: 50 }, 0.08, 1000, 1000)).toEqual({ x: 92, y: 96, w: 116, h: 58 });
    expect(pad({ x: 0, y: 0, w: 100, h: 100 }, 0.08, 104, 104)).toEqual({ x: 0, y: 0, w: 104, h: 104 });
  });

  it('merges overlapping text boxes only', () => {
    const merged = mergeText([f('a', 'text', 0, 0), f('b', 'text', 10, 0), f('c', 'text', 500, 500)]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.box).toEqual({ x: 0, y: 0, w: 110, h: 50 });
  });

  it('selects every zone by default except people', () => {
    const zones = findingsToZones(
      [f('1', 'face', 0, 0), f('2', 'person', 200, 0), f('3', 'text', 400, 0)],
      1000,
      1000,
    );
    expect(zones.map((z) => [z.category, z.selected])).toEqual([
      ['face', true],
      ['person', false],
      ['text', true],
    ]);
    expect(zones.every((z) => z.kind === 'detected' && z.findingId)).toBe(true);
  });
});

describe('zone editing', () => {
  const z = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    kind: Zone['kind'] = 'detected',
  ): Zone => ({
    id,
    kind,
    category: kind === 'manual' ? 'manual' : 'face',
    rect: { x, y, w, h },
    selected: true,
  });

  it('toggles one zone', () => {
    const out = toggleZone([z('a', 0, 0, 10, 10), z('b', 20, 0, 10, 10)], 'a');
    expect(out.map((x) => x.selected)).toEqual([false, true]);
  });

  it('adds a normalized manual zone of at least 16 px per side, clamped', () => {
    expect(addManualZone([], { x: 0, y: 0, w: 15, h: 40 }, 100, 100)).toHaveLength(0);
    const [m] = addManualZone([], { x: 90, y: 50, w: -40, h: 80 }, 100, 100);
    expect(m).toMatchObject({
      kind: 'manual',
      category: 'manual',
      selected: true,
      rect: { x: 50, y: 50, w: 40, h: 50 },
    });
  });

  it('removes manual zones only', () => {
    const zones = [z('a', 0, 0, 10, 10), z('m', 0, 0, 20, 20, 'manual')];
    expect(removeZone(zones, 'a')).toHaveLength(2);
    expect(removeZone(zones, 'm').map((x) => x.id)).toEqual(['a']);
  });

  it('hit-tests the smallest containing zone', () => {
    const zones = [z('big', 0, 0, 100, 100), z('small', 40, 40, 10, 10)];
    expect(hitTest(zones, 45, 45)?.id).toBe('small');
    expect(hitTest(zones, 5, 5)?.id).toBe('big');
    expect(hitTest(zones, 200, 5)).toBeNull();
  });
});

describe('dense text grouping', () => {
  const t = (i: number, x: number, y: number): VisualFinding => ({
    id: `t${i}`,
    category: 'text',
    box: { x, y, w: 30, h: 10 },
    score: 0.9,
    source: 'ppocr',
  });

  it('groups words into lines', () => {
    const lines = groupLines([t(0, 0, 0), t(1, 40, 1), t(2, 80, 0), t(3, 0, 20), t(4, 40, 21)]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.box).toEqual({ x: 0, y: 0, w: 110, h: 11 });
  });

  it('applies only above 60 text zones', () => {
    const few = Array.from({ length: 10 }, (_, i) => t(i, i * 40, 0));
    expect(findingsToZones(few, 1000, 1000)).toHaveLength(10);
    const many = Array.from({ length: 70 }, (_, i) => t(i, (i % 10) * 40, Math.floor(i / 10) * 30));
    expect(findingsToZones(many, 1000, 1000)).toHaveLength(7);
  });
});

describe('resizeZone', () => {
  const z: Zone[] = [
    { id: 'a', kind: 'detected', category: 'text', rect: { x: 10, y: 10, w: 40, h: 40 }, selected: true },
  ];
  it('normalizes and clamps the new rectangle to the image', () => {
    expect(resizeZone(z, 'a', { x: 120, y: 30, w: -100, h: 90 }, 100, 100)[0]!.rect).toEqual({
      x: 20,
      y: 30,
      w: 80,
      h: 70,
    });
  });
  it('refuses a rectangle smaller than the minimum side', () => {
    expect(resizeZone(z, 'a', { x: 10, y: 10, w: 5, h: 40 }, 100, 100)).toBe(z);
  });
});
