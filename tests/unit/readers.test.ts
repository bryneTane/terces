import { describe, expect, it } from 'vitest';
import { chooseReading, isEvidence, READERS, rtlOrder, toNative } from '../../src/worker/models/readers.ts';

const reader = (key: string) => READERS.find((r) => r.key === key)!;
const reads = (o: Record<string, [string, number]>) =>
  new Map(Object.entries(o).map(([k, [text, score]]) => [k, { text, score }]));

describe('choosing one reading per box', () => {
  it('keeps the Latin reading when other readers only drop accents', () => {
    // Every reader knows basic Latin: the Greek one reads "Bäckerei" as "Bckerei", more confidently.
    expect(
      chooseReading(reads({ latin: ['Bäckerei', 0.98], el: ['Bckerei', 1], zh: ['Bäckerei', 0.9] })),
    ).toBe('Bäckerei');
  });

  it('prefers the alphabet a reader proves, even over a confident Latin guess', () => {
    expect(chooseReading(reads({ latin: ['APMAKEIO', 0.99], el: ['ΦΑΡΜΑΚΕΙΟ', 0.99] }))).toBe('ΦΑΡΜΑΚΕΙΟ');
    expect(chooseReading(reads({ latin: ['7', 0.88], korean: ['출구', 0.99] }))).toBe('출구');
  });

  it('does not take Latin-looking Greek or Cyrillic letters as proof', () => {
    // "TOURIST" read by the Greek reader as "ΤΟΥ": every letter also looks Latin.
    expect(isEvidence(reader('el'), { text: 'ΤΟΥ', score: 0.99 })).toBe(false);
    expect(chooseReading(reads({ latin: ['TOURIST', 0.97], el: ['ΤΟΥ', 0.99] }))).toBe('TOURIST');
    expect(isEvidence(reader('cyrillic'), { text: 'Ленина', score: 0.9 })).toBe(true);
  });

  it('needs most letters in the alphabet and a confident read', () => {
    expect(isEvidence(reader('zh'), { text: '七ód之', score: 0.95 })).toBe(false);
    expect(isEvidence(reader('zh'), { text: '东京', score: 0.6 })).toBe(false);
    expect(isEvidence(reader('zh'), { text: '[麦芽100%]生ビール', score: 0.95 })).toBe(true);
  });

  it('reads numbers with the Latin reader', () => {
    expect(
      chooseReading(reads({ latin: ['+33 6 12 34 56 78', 0.97], th: ['+33 6 12 34 56 78', 0.99] })),
    ).toBe('+33 6 12 34 56 78');
  });

  it('returns nothing when no reader read the box', () => {
    expect(chooseReading(reads({ latin: ['', 0], zh: ['', 0] }))).toBeNull();
    expect(chooseReading(reads({ latin: ['x', 0.3] }))).toBeNull();
  });
});

describe('cleaning a chosen reading', () => {
  it('turns Arabic from visual order into reading order, keeping numbers as they are', () => {
    expect(rtlOrder('كلملا عراش')).toBe('شارع الملك');
    expect(rtlOrder('2024 معطم')).toBe('مطعم 2024');
    expect(chooseReading(reads({ arabic: ['ةيلديص', 0.99], latin: ['', 0] }))).toBe('صيدلية');
  });

  it('replaces Latin lookalikes inside Cyrillic and Greek words only', () => {
    expect(toNative(reader('cyrillic'), 'Улица ЛеHиHa')).toBe('Улица Ленина');
    expect(toNative(reader('cyrillic'), 'Москва HOTEL')).toBe('Москва HOTEL');
    expect(toNative(reader('el'), 'Οδός EPMOY')).toBe('Οδός EPMOY');
    expect(toNative(reader('zh'), 'ABC')).toBe('ABC');
  });
});
