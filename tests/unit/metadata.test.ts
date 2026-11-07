import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { displayValue, groupMetadata, readMetadata } from '../../src/lib/metadata.ts';

const fixture = (name: string) => {
  const b = readFileSync(`tests/fixtures/${name}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe('metadata', () => {
  it('groups the identifying metadata of street-gps.jpg', async () => {
    const m = await readMetadata(fixture('street-gps.jpg'));
    expect(m.map((f) => f.group)).toEqual(['location', 'datetime', 'device', 'lens', 'software', 'identity']);
    const loc = m.find((f) => f.group === 'location')!;
    expect(loc.geo?.lat).toBeCloseTo(45.764, 3);
    expect(loc.geo?.lon).toBeCloseTo(4.8357, 3);
    expect(m.find((f) => f.group === 'device')?.value).toBe('Apple iPhone 17 Pro');
    const identity = m.find((f) => f.group === 'identity')!;
    expect(identity.value).toContain('F2LX1234ABCD');
    expect(identity.value).toContain('Jane Doe');
    expect(loc.label).toBe('meta.location');
  });

  it('finds no metadata in a plain PNG', async () => {
    expect(await readMetadata(fixture('no-metadata.png'))).toEqual([]);
  });

  it('never throws on garbage', async () => {
    expect(await readMetadata(new Uint8Array([1, 2, 3]).buffer)).toEqual([]);
  });

  it('ignores empty and invalid values', () => {
    expect(groupMetadata({ Make: '', Model: '\0', latitude: Number.NaN, longitude: 2 })).toEqual([]);
    expect(groupMetadata(null)).toEqual([]);
  });
});

describe('display values', () => {
  it('formats location with the nearby place, and localizes dates', async () => {
    const m = await readMetadata(fixture('street-gps.jpg'));
    const loc = m.find((f) => f.group === 'location')!;
    expect(displayValue(loc, 'en')).toBe('45.7640, 4.8357');
    expect(
      displayValue({ ...loc, geo: { ...loc.geo!, place: 'Lyon, FR' } }, 'en', (p) => `(near ${p})`),
    ).toBe('45.7640, 4.8357 (near Lyon, FR)');
    const date = m.find((f) => f.group === 'datetime')!;
    const en = displayValue(date, 'en');
    const fr = displayValue(date, 'fr');
    expect(en).toMatch(/20\d\d/);
    expect(en).not.toBe(fr);
    expect(en).not.toContain('T');
  });

  it('passes other groups through', () => {
    expect(
      displayValue({ group: 'device', label: 'meta.device', value: 'Apple iPhone 17 Pro', raw: {} }, 'fr'),
    ).toBe('Apple iPhone 17 Pro');
  });
});
