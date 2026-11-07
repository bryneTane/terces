// /admin and /admin/*: the static dashboard is served only with a valid Access token.
import { verifyAccess } from '../_lib/access.ts';
import type { Env } from '../_lib/env.ts';

export async function onRequest(context: {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}): Promise<Response> {
  if (!(await verifyAccess(context.request, context.env)))
    return new Response('Not authorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const r = await context.next();
  const out = new Response(r.body, r);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Robots-Tag', 'noindex');
  return out;
}
