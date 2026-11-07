import { describe, expect, it } from 'vitest';
import { isPlate, looksLikePlateText, reclassifyPlates } from '../../src/lib/plates.ts';
import type { VisualFinding } from '../../src/lib/types.ts';

const wide = { x: 0, y: 0, w: 200, h: 50 }; // aspect 4
const text = (t: string, box = wide, id = t): VisualFinding => ({
  id,
  category: 'text',
  box,
  score: 0.9,
  source: 'ppocr',
  text: t,
});
const car = { x: 100, y: 100, w: 800, h: 500 };

describe('plate rule', () => {
  it.each(['AB-123-CD', '1ABC234', 'ab 123 cd', 'GE.123.45'])('%s is a plate by text and shape', (t) => {
    expect(isPlate(text(t), [])).toBe(true);
  });

  it('a text box inside a car box is a plate, whatever it says', () => {
    expect(isPlate(text('ZZ', { x: 400, y: 450, w: 120, h: 30 }), [car])).toBe(true);
  });

  it('a large text box overlapping a vehicle by IoU > 0.1 is a plate', () => {
    expect(isPlate(text('SALE', { x: 0, y: 0, w: 300, h: 300 }), [{ x: 100, y: 100, w: 300, h: 300 }])).toBe(
      true,
    );
  });

  it.each([
    ['HELLO', wide],
    ['12 RUE DE LA PAIX', wide],
    ['AB-123-CD', { x: 0, y: 0, w: 40, h: 120 }], // tall box
    ['AB-123-CD', { x: 0, y: 0, w: 400, h: 40 }], // aspect 10
    ['ABCDEF', wide], // no digit
  ] as const)('%s (%o) is not a plate', (t, box) => {
    expect(isPlate(text(t, box), [])).toBe(false);
  });

  it('text far from a vehicle is not reclassified by position', () => {
    expect(isPlate(text('OPEN', { x: 2000, y: 2000, w: 100, h: 30 }), [car])).toBe(false);
  });

  it('reclassifyPlates returns only changed findings, as plate-rule plates', () => {
    const out = reclassifyPlates([text('AB-123-CD'), text('HELLO')], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'AB-123-CD',
      category: 'plate',
      source: 'plate-rule',
      text: 'AB-123-CD',
    });
  });

  it('looksLikePlateText handles missing text', () => {
    expect(looksLikePlateText(undefined)).toBe(false);
  });
});
