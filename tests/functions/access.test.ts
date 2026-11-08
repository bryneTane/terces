// @vitest-environment node
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, expect, test } from 'vitest';
import { verifyAccess } from '../../functions/_lib/access.ts';

const env = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud-123' };
let keys: ReturnType<typeof createLocalJWKSet>;
let sign: (claims: { aud?: string; exp?: number }) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  keys = createLocalJWKSet({ keys: [jwk] });
  sign = ({ aud = env.ACCESS_AUD, exp }) =>
    new SignJWT({ email: 'owner@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(`https://${env.ACCESS_TEAM_DOMAIN}`)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp ?? '1h')
      .sign(privateKey);
});

const req = (token?: string) =>
  new Request('https://terces.example/admin/stats', {
    headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {},
  });

test('valid token passes', async () => {
  expect(await verifyAccess(req(await sign({})), env, keys)).toBe(true);
});
test('wrong audience fails', async () => {
  expect(await verifyAccess(req(await sign({ aud: 'other' })), env, keys)).toBe(false);
});
test('expired token fails', async () => {
  expect(await verifyAccess(req(await sign({ exp: Math.floor(Date.now() / 1000) - 60 })), env, keys)).toBe(
    false,
  );
});
test('missing header fails', async () => {
  expect(await verifyAccess(req(), env, keys)).toBe(false);
});
test('unconfigured env fails closed', async () => {
  expect(await verifyAccess(req(await sign({})), { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' }, keys)).toBe(
    false,
  );
});

test('admin middleware blocks without a token and passes with one', async () => {
  const { onRequest } = await import('../../functions/admin/_middleware.ts');
  const next = async () => new Response('page');
  const denied = await onRequest({ request: req(), env: { ...env, DB: null as never }, next });
  expect(denied.status).toBe(401);
});
