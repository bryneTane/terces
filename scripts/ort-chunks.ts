import { createHash } from 'node:crypto';

/** Cloudflare Pages / Workers static assets reject files over 25 MiB. Stay well below. */
export const MAX_CHUNK = 20 * 1024 * 1024;

export interface OrtWasmManifest {
  version: string;
  glue: string;
  bytes: number;
  sha256: string;
  parts: string[];
}

export function splitBuffer(buf: Uint8Array, max = MAX_CHUNK): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let off = 0; off < buf.byteLength; off += max)
    parts.push(buf.subarray(off, Math.min(off + max, buf.byteLength)));
  return parts;
}

export function buildManifest(
  version: string,
  glue: string,
  wasmName: string,
  buf: Uint8Array,
  max = MAX_CHUNK,
): {
  manifest: OrtWasmManifest;
  parts: Uint8Array[];
} {
  const parts = splitBuffer(buf, max);
  return {
    parts,
    manifest: {
      version,
      glue,
      bytes: buf.byteLength,
      sha256: createHash('sha256').update(buf).digest('hex'),
      parts: parts.map((_, i) => `${wasmName}.part${i}`),
    },
  };
}
