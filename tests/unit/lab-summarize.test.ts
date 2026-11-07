import { describe, expect, it } from 'vitest';
import { formatValue, groupOf, summarize } from '../../src/lab/summarize.ts';

describe('lab summarize', () => {
  it('groups common EXIF fields', () => {
    expect(groupOf('GPSLatitude')).toBe('gps');
    expect(groupOf('latitude')).toBe('gps');
    expect(groupOf('DateTimeOriginal')).toBe('date');
    expect(groupOf('Model')).toBe('device');
    expect(groupOf('BodySerialNumber')).toBe('identity');
    expect(groupOf('ExposureTime')).toBe('other');
  });

  it('summarizes a parsed record and detects GPS', () => {
    const s = summarize({
      latitude: 45.764,
      longitude: 4.8357,
      Make: 'Apple',
      Model: 'iPhone 17',
      DateTimeOriginal: new Date('2026-11-07T10:00:00Z'),
      Artist: 'Jane',
      FNumber: 1.8,
      Empty: undefined,
    });
    expect(s.hasGps).toBe(true);
    expect(s.fieldCount).toBe(7);
    expect(s.groups.date[0]?.value).toBe('2026-11-07T10:00:00.000Z');
    expect(s.groups.identity.map((f) => f.key)).toEqual(['Artist']);
  });

  it('handles missing metadata', () => {
    const s = summarize(undefined);
    expect(s.fieldCount).toBe(0);
    expect(s.hasGps).toBe(false);
  });

  it('formats binary values by size', () => {
    expect(formatValue(new Uint8Array(12))).toBe('<12 bytes>');
  });
});
