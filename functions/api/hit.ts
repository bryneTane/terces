// POST /api/hit: increments one daily total. Reads only Origin, Sec-Fetch-Site and
// Content-Length; never IP, User-Agent, cookies or any other header.
import { EVENTS, utcDay, type Context, type UsageEvent } from '../_lib/env.ts';

export const UPSERT =
  'INSERT INTO daily_counts (day, event, count) VALUES (?1, ?2, 1) ON CONFLICT (day, event) DO UPDATE SET count = count + 1';
const MAX_BODY = 16;

export async function onRequest({ request, env }: Context): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });

  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if (
    (origin !== null && origin !== new URL(request.url).origin) ||
    (site !== null && site !== 'same-origin')
  ) {
    return new Response(null, { status: 403 });
  }

  const length = Number(request.headers.get('Content-Length') ?? '0');
  if (length > MAX_BODY) return new Response(null, { status: 400 });
  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_BODY) return new Response(null, { status: 400 });
  const event = new TextDecoder().decode(raw).trim();
  if (!(EVENTS as readonly string[]).includes(event)) return new Response(null, { status: 400 });

  try {
    await env.DB.prepare(UPSERT)
      .bind(utcDay(), event as UsageEvent)
      .run();
  } catch {
    console.error('hit failed', event);
  }
  return new Response(null, { status: 204 });
}
