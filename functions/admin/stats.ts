// GET /admin/stats: today, last 30 UTC days (newest first, zero-filled), totals, cloak rate.
// Under /admin, so the Access app guards it at the edge and adds its signed header, like the page.
import { verifyAccess } from '../_lib/access.ts';
import { utcDay, type Context, type Env } from '../_lib/env.ts';

export interface DayCount {
  day: string;
  scan: number;
  cloak: number;
}
export interface Stats {
  today: DayCount;
  days: DayCount[];
  total: { scan: number; cloak: number };
  cloakRate: number | null;
}

export const DAYS = 30;

export function lastDays(now: Date, n = DAYS): string[] {
  const out: string[] = [];
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = 0; i < n; i++) out.push(utcDay(new Date(t - i * 86_400_000)));
  return out;
}

export async function readStats(env: Pick<Env, 'DB'>, now = new Date()): Promise<Stats> {
  const days = lastDays(now);
  const oldest = days[days.length - 1]!;
  const { results } = await env.DB.prepare('SELECT day, event, count FROM daily_counts WHERE day >= ?1')
    .bind(oldest)
    .all<{ day: string; event: string; count: number }>();
  const byDay = new Map(days.map((day) => [day, { day, scan: 0, cloak: 0 }]));
  for (const r of results) {
    const d = byDay.get(r.day);
    if (d && (r.event === 'scan' || r.event === 'cloak')) d[r.event] = Number(r.count);
  }
  const totals = await env.DB.prepare('SELECT event, SUM(count) AS n FROM daily_counts GROUP BY event').all<{
    event: string;
    n: number;
  }>();
  const total = { scan: 0, cloak: 0 };
  for (const r of totals.results) if (r.event === 'scan' || r.event === 'cloak') total[r.event] = Number(r.n);
  const list = [...byDay.values()];
  return { today: list[0]!, days: list, total, cloakRate: total.scan ? total.cloak / total.scan : null };
}

export async function onRequest(
  { request, env }: Context,
  keys?: Parameters<typeof verifyAccess>[2],
): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  if (!(await verifyAccess(request, env, keys)))
    return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const stats = await readStats(env);
  return Response.json(stats, { headers: { 'Cache-Control': 'no-store' } });
}
