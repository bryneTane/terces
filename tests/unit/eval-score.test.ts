import { describe, expect, it } from 'vitest';
import { scoreImage, shareInside, totals, type EvalImage } from '../../scripts/eval-score.ts';

const img: EvalImage = {
  id: 'a',
  scope: ['text', 'face'],
  boxes: [
    { cat: 'text', x: 0.1, y: 0.1, w: 0.2, h: 0.05, text: 'CAFE' },
    { cat: 'plate', x: 0.6, y: 0.8, w: 0.1, h: 0.04 },
    { cat: 'face', x: 0.5, y: 0.2, w: 0.1, h: 0.15 },
  ],
  ignore: [{ cat: 'text', x: 0.8, y: 0.1, w: 0.1, h: 0.1 }],
};

describe('eval scoring', () => {
  it('measures how much of a box is covered', () => {
    expect(shareInside({ x: 0, y: 0, w: 1, h: 1 }, [{ x: 0, y: 0, w: 0.5, h: 1 }])).toBeCloseTo(0.5);
    expect(shareInside({ x: 0, y: 0, w: 1, h: 1 }, [])).toBe(0);
  });

  it('counts covered boxes, misses and false zones per family; plates count as text', () => {
    const s = scoreImage(img, [
      { cat: 'text', x: 0.09, y: 0.09, w: 0.22, h: 0.07 }, // covers CAFE
      { cat: 'text', x: 0.58, y: 0.78, w: 0.14, h: 0.08 }, // covers the plate: still hidden
      { cat: 'text', x: 0.81, y: 0.11, w: 0.05, h: 0.05 }, // inside an ignored region: not false
      { cat: 'text', x: 0.4, y: 0.6, w: 0.05, h: 0.05 }, // a button: false
      { cat: 'face', x: 0.52, y: 0.22, w: 0.04, h: 0.04 }, // too small to hide the face
    ]);
    expect(s.text).toMatchObject({ labelled: 2, covered: 2, zones: 4, falseZones: 1 });
    expect(s.face).toMatchObject({ labelled: 1, covered: 0, zones: 1, falseZones: 0 });
    expect(s.face!.misses).toHaveLength(1);
  });

  it('on a plates-only photo, scores plate coverage but counts no false text zones', () => {
    const plates = { ...img, scope: ['plate' as const] };
    const s = scoreImage(plates, [{ cat: 'text', x: 0.4, y: 0.6, w: 0.05, h: 0.05 }]);
    expect(s.text).toMatchObject({ labelled: 2, covered: 0, falseZones: 0 });
  });

  it('only scores families in scope, and totals across photos', () => {
    const textOnly = scoreImage({ ...img, scope: ['text'] }, []);
    expect(textOnly.face).toBeUndefined();
    const t = totals([textOnly, scoreImage(img, [])], 'text');
    expect(t).toMatchObject({ images: 2, labelled: 4, covered: 0, recall: 0, precision: 1 });
  });
});
