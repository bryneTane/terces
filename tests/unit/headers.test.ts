import { describe, expect, it } from 'vitest';
import { CSP, renderHeadersFile } from '../../config/headers.ts';

// The exact policy. Loosening it weakens the privacy proof: change it deliberately.
const CONTRACT = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Referrer-Policy: no-referrer
  Permissions-Policy: geolocation=(), microphone=(), camera=(self)
  X-Content-Type-Options: nosniff

/models/*
  Cache-Control: public, max-age=31536000, immutable
`;

describe('hosting headers', () => {
  it('renders _headers exactly as the contract', () => {
    expect(renderHeadersFile()).toBe(CONTRACT);
  });

  it('never allows another origin to receive requests', () => {
    const connect = CSP.split('; ').find((d) => d.startsWith('connect-src'));
    expect(connect).toBe("connect-src 'self'");
    expect(CSP).not.toMatch(/https?:/);
  });
});
