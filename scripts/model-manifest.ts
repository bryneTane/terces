// Model manifest helpers (every model has source, license, size and checksum).
import { createHash } from 'node:crypto';

export interface ModelEntry {
  name: string;
  file: string;
  url: string;
  bytes: number;
  sha256: string;
  license: string;
  licenseUrl: string;
  source: string;
}

export interface Manifest {
  version: number;
  models: ModelEntry[];
}

export const ALLOWED_LICENSES = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'];

export function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

export type VerifyResult = { ok: true; pinned: boolean; entry: ModelEntry } | { ok: false; reason: string };

/**
 * Verify downloaded bytes against an entry. An entry with an empty sha256 is pinned
 * (first fetch); afterwards any mismatch fails.
 */
export function verifyOrPin(entry: ModelEntry, buf: Uint8Array): VerifyResult {
  if (!ALLOWED_LICENSES.includes(entry.license))
    return { ok: false, reason: `${entry.name}: license ${entry.license} not allowed` };
  const hash = sha256(buf);
  if (!entry.sha256)
    return { ok: true, pinned: true, entry: { ...entry, sha256: hash, bytes: buf.byteLength } };
  if (hash !== entry.sha256)
    return { ok: false, reason: `${entry.name}: sha256 mismatch (expected ${entry.sha256}, got ${hash})` };
  if (entry.bytes && entry.bytes !== buf.byteLength)
    return {
      ok: false,
      reason: `${entry.name}: size mismatch (expected ${entry.bytes}, got ${buf.byteLength})`,
    };
  return { ok: true, pinned: false, entry };
}
