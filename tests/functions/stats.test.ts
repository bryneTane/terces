// @vitest-environment node
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { expect, test } from 'vitest';
import { lastDays, onRequest, readStats, type Stats } from '../../functions/api/admin/stats.ts';
import { createD1 } from './d1.ts';

const NOW = new Date('2026-11-07T10:00:00Z');

function seeded() {
  const db = createD1();
  const ins = db.raw.prepare('INSERT INTO daily_counts VALUES (?, ?, ?)');
  ins.run('2026-11-07', 'scan', 12);
  ins.run('2026-11-07', 'cloak', 9);
  ins.run('2026-11-05', 'scan', 3);
  ins.run('2026-09-01', 'scan', 100); // outside the 30-day window, still in totals
  ins.run('2026-09-01', 'cloak', 1);
  return db;
}

test('lastDays is 30 UTC days, newest first', () => {
  const d = lastDays(NOW);
  expect(d).toHaveLength(30);
  expect(d[0]).toBe('2026-11-07');
  expect(d[1]).toBe('2026-11-06');
  expect(d[29]).toBe('2026-10-09');
});

test('stats are zero-filled with totals and cloak rate', async () => {
  const s = await readStats({ DB: seeded() }, NOW);
  expect(s.today).toEqual({ day: '2026-11-07', scan: 12, cloak: 9 });
  expect(s.days[1]).toEqual({ day: '2026-11-06', scan: 0, cloak: 0 });
  expect(s.days[2]).toEqual({ day: '2026-11-05', scan: 3, cloak: 0 });
  expect(s.total).toEqual({ scan: 115, cloak: 10 });
  expect(s.cloakRate).toBeCloseTo(10 / 115);
});

test('cloak rate is null with no scans', async () => {
  expect((await readStats({ DB: createD1() }, NOW)).cloakRate).toBeNull();
});

test('the endpoint needs Access and is never cached', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k', alg: 'RS256' }] });
  const env = { DB: seeded(), ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'aud' };
  const url = 'https://terces.example/api/admin/stats';

  const denied = await onRequest({ request: new Request(url), env }, keys);
  expect(denied.status).toBe(401);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'k' })
    .setIssuer('https://t.cloudflareaccess.com')
    .setAudience('aud')
    .setExpirationTime('1h')
    .sign(privateKey);
  const ok = await onRequest(
    { request: new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': token } }), env },
    keys,
  );
  expect(ok.status).toBe(200);
  expect(ok.headers.get('Cache-Control')).toBe('no-store');
  const body = (await ok.json()) as Stats;
  expect(body.days).toHaveLength(30);

  expect(
    (
      await onRequest(
        { request: new Request(url, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': token } }), env },
        keys,
      )
    ).status,
  ).toBe(405);
});
