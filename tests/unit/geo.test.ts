import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import {
  haversineKm,
  loadCities,
  nearestPlace,
  placeLabel,
  resetGeoCache,
  type City,
} from '../../src/lib/geo.ts';

const cities = JSON.parse(readFileSync('public/geo/cities15000.min.json', 'utf8')) as City[];
const ok = () =>
  vi.fn(async () => new Response(JSON.stringify(cities), { status: 200 })) as unknown as typeof fetch;

afterEach(() => resetGeoCache());

test('Lyon coordinates give Lyon, FR', () => {
  const p = nearestPlace(45.764, 4.8357, cities);
  expect(p).toMatchObject({ name: 'Lyon', country: 'FR' });
  expect(p!.km).toBeLessThan(2);
});

test('haversine: Paris to Lyon is about 392 km, same point is 0', () => {
  expect(haversineKm(48.8566, 2.3522, 45.764, 4.8357)).toBeCloseTo(392, -1);
  expect(haversineKm(10, 20, 10, 20)).toBe(0);
});

test('nearestPlace on an empty list is null', () => {
  expect(nearestPlace(0, 0, [])).toBeNull();
});

test('placeLabel loads once, same-origin, and labels', async () => {
  const f = ok();
  expect(await placeLabel(45.764, 4.8357, f)).toBe('Lyon, FR');
  expect(await placeLabel(48.8566, 2.3522, f)).toBe('Paris, FR');
  expect(f).toHaveBeenCalledTimes(1);
  expect(f).toHaveBeenCalledWith('/geo/cities15000.min.json', expect.anything());
});

test('a failed load returns null and can be retried', async () => {
  const bad = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
  expect(await placeLabel(45.764, 4.8357, bad)).toBeNull();
  const thrown = vi.fn(async () => {
    throw new TypeError('offline');
  }) as unknown as typeof fetch;
  expect(await placeLabel(45.764, 4.8357, thrown)).toBeNull();
  expect((await loadCities(ok())).length).toBe(cities.length);
});
