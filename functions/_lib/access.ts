// Cloudflare Access JWT check for the admin routes (defence in depth behind the Access app).
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from './env.ts';

const remote = new Map<string, JWTVerifyGetKey>();
function remoteKeys(team: string): JWTVerifyGetKey {
  let keys = remote.get(team);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    remote.set(team, keys);
  }
  return keys;
}

export async function verifyAccess(
  request: Request,
  env: Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD'>,
  keys?: JWTVerifyGetKey,
): Promise<boolean> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;
  try {
    await jwtVerify(token, keys ?? remoteKeys(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    });
    return true;
  } catch {
    return false;
  }
}
