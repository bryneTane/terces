// Single source of truth for the HTTP headers that back the privacy proof.

export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

/** Isolation headers: required for multi-threaded WASM (crossOriginIsolated). */
export const ISOLATION_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  ...ISOLATION_HEADERS,
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(self)',
  'X-Content-Type-Options': 'nosniff',
};

export const MODEL_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'public, max-age=31536000, immutable',
};

/** Renders the Cloudflare Pages `_headers` file. */
export function renderHeadersFile(): string {
  const block = (path: string, headers: Record<string, string>) =>
    [path, ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)].join('\n');
  return [block('/*', SECURITY_HEADERS), block('/models/*', MODEL_CACHE_HEADERS)].join('\n\n') + '\n';
}
