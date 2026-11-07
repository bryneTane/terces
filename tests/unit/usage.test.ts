import { afterEach, expect, test, vi } from 'vitest';
import { count } from '../../src/lib/usage.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

test('sends the event name only, by beacon', async () => {
  const beacon = vi.fn(() => true);
  vi.stubGlobal('navigator', { onLine: true, sendBeacon: beacon });
  count('scan');
  expect(beacon).toHaveBeenCalledTimes(1);
  const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
  expect(url).toBe('/api/hit');
  expect(await blob.text()).toBe('scan');
});

test('falls back to fetch without credentials', () => {
  vi.stubGlobal('navigator', { onLine: true, sendBeacon: () => false });
  const f = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', f);
  count('cloak');
  expect(f).toHaveBeenCalledWith(
    '/api/hit',
    expect.objectContaining({ method: 'POST', body: 'cloak', credentials: 'omit', keepalive: true }),
  );
});

test('does nothing offline', () => {
  const beacon = vi.fn(() => true);
  vi.stubGlobal('navigator', { onLine: false, sendBeacon: beacon });
  count('scan');
  expect(beacon).not.toHaveBeenCalled();
});

test('does nothing on the device lab page', () => {
  history.replaceState(null, '', '/lab.html');
  const beacon = vi.fn(() => true);
  vi.stubGlobal('navigator', { onLine: true, sendBeacon: beacon });
  count('scan');
  expect(beacon).not.toHaveBeenCalled();
});

test('swallows errors', () => {
  vi.stubGlobal('navigator', {
    onLine: true,
    sendBeacon: () => {
      throw new Error('boom');
    },
  });
  expect(() => count('scan')).not.toThrow();
});
