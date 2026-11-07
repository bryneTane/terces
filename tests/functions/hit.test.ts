// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { onRequest } from '../../functions/api/hit.ts';
import { utcDay, type Env } from '../../functions/_lib/env.ts';
import { createD1 } from './d1.ts';

const URL_ = 'https://terces.example/api/hit';
const env = (db = createD1()) => ({ DB: db, ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' }) satisfies Env;
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request(URL_, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'text/plain',
      Origin: 'https://terces.example',
      'Sec-Fetch-Site': 'same-origin',
      ...headers,
    },
  });
const counts = (db: ReturnType<typeof createD1>) =>
  db.raw.prepare('SELECT event, count FROM daily_counts WHERE day = ?').all(utcDay());

afterEach(() => vi.restoreAllMocks());

test('two scans and one cloak are counted for today', async () => {
  const e = env();
  for (const b of ['scan', 'scan', 'cloak'])
    expect((await onRequest({ request: post(b), env: e })).status).toBe(204);
  expect(counts(e.DB)).toEqual(
    expect.arrayContaining([
      { event: 'scan', count: 2 },
      { event: 'cloak', count: 1 },
    ]),
  );
});

test('requests without Origin or Sec-Fetch-Site (sendBeacon on some browsers) are accepted', async () => {
  const e = env();
  const r = new Request(URL_, { method: 'POST', body: 'scan' });
  expect((await onRequest({ request: r, env: e })).status).toBe(204);
});

test.each([
  ['GET', () => new Request(URL_), 405],
  ['foreign Origin', () => post('scan', { Origin: 'https://evil.example' }), 403],
  ['cross-site fetch', () => post('scan', { 'Sec-Fetch-Site': 'cross-site' }), 403],
  ['unknown event', () => post('visit'), 400],
  ['17-byte body', () => post('scan'.padEnd(17, ' ')), 400],
])('%s is rejected and stores nothing', async (_, make, status) => {
  const e = env();
  expect((await onRequest({ request: make(), env: e })).status).toBe(status);
  expect(counts(e.DB)).toEqual([]);
});

test('a D1 failure still returns 204 and logs only the event name', async () => {
  const db = createD1();
  db.fail = true;
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect((await onRequest({ request: post('cloak'), env: env(db) })).status).toBe(204);
  expect(log).toHaveBeenCalledWith('hit failed', 'cloak');
});
