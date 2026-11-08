import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../../config/pwa.ts';

const opts = pwaOptions('terces-models-v1-ort1.31.1');
const wb = opts.workbox!;
const route = (path: string) =>
  wb.runtimeCaching!.find((r) =>
    (r.urlPattern as (o: { url: URL }) => boolean)({ url: new URL(`https://x${path}`) }),
  );

describe('service worker config', () => {
  it('never caches or replays the usage counter', () => {
    expect(route('/api/hit')?.handler).toBe('NetworkOnly');
    expect(JSON.stringify(opts)).not.toMatch(/backgroundSync/);
  });

  it('serves models and ORT from the versioned cache', () => {
    expect(route('/models/yunet.onnx')).toMatchObject({
      handler: 'CacheFirst',
      options: { cacheName: 'terces-models-v1-ort1.31.1' },
    });
    expect(route('/ort/x.wasm.part0')?.handler).toBe('CacheFirst');
  });

  it('keeps admin, lab, models and ORT out of the precache', () => {
    for (const p of ['admin/**', 'lab.html', 'models/**', 'ort/**']) expect(wb.globIgnores).toContain(p);
  });

  it('falls back to the app shell for the app pages only, never for server pages', () => {
    expect(wb.navigateFallbackDenylist).toBeUndefined();
    const [allow] = wb.navigateFallbackAllowlist!;
    for (const p of ['/', '/?source=pwa', '/fr/', '/fr/?x=1', '/index.html'])
      expect(allow!.test(p), p).toBe(true);
    for (const p of [
      '/cdn-cgi/access/authorized?nonce=1&state=2',
      '/admin',
      '/admin/',
      '/api/hit',
      '/lab.html',
      '/fr/admin',
    ])
      expect(allow!.test(p), p).toBe(false);
  });
});
