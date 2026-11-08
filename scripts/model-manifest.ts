// Model manifest helpers (every model has source, license, size and checksum).
import { createHash } from 'node:crypto';
import { int8Weights, paddleDict } from './onnx-int8.ts';

export interface ModelEntry {
  name: string;
  file: string;
  url: string;
  bytes: number;
  sha256: string;
  license: string;
  licenseUrl: string;
  source: string;
  /**
   * How the served file is made from the download: `int8-weights` stores Conv/MatMul weights in
   * 8 bits (scripts/onnx-int8.ts), `paddle-dict` extracts the dictionary of a PaddleOCR
   * inference.yml as JSON. `sourceSha256`/`sourceBytes` pin the download, `sha256`/`bytes` the
   * served file.
   */
  convert?: 'int8-weights' | 'paddle-dict';
  sourceSha256?: string;
  sourceBytes?: number;
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

/** The served file for a downloaded source (see `ModelEntry.convert`). */
export function convertSource(entry: ModelEntry, source: Uint8Array): Uint8Array {
  if (entry.convert === 'int8-weights') return int8Weights(source).bytes;
  if (entry.convert === 'paddle-dict')
    return new TextEncoder().encode(JSON.stringify(paddleDict(new TextDecoder().decode(source))));
  return source;
}

/**
 * Verifies a download and turns it into the served file. Converted entries are checked twice:
 * the download against the source pin, the result against the served pin. Empty pins are filled.
 */
export function prepare(
  entry: ModelEntry,
  download: Uint8Array,
): { ok: true; pinned: boolean; entry: ModelEntry; bytes: Uint8Array } | { ok: false; reason: string } {
  if (!entry.convert) {
    const r = verifyOrPin(entry, download);
    return r.ok ? { ...r, bytes: download } : r;
  }
  const src = verifyOrPin(
    { ...entry, sha256: entry.sourceSha256 ?? '', bytes: entry.sourceBytes ?? 0 },
    download,
  );
  if (!src.ok) return { ok: false, reason: `${src.reason} (download)` };
  const bytes = convertSource(entry, download);
  const pinnedSource = { ...entry, sourceSha256: src.entry.sha256, sourceBytes: src.entry.bytes };
  const out = verifyOrPin(pinnedSource, bytes);
  if (!out.ok) return out;
  return { ok: true, pinned: src.pinned || out.pinned, entry: out.entry, bytes };
}

/**
 * One license copy per source project, shipped next to the models as Apache-2.0 asks:
 * github.com/PaddlePaddle/PaddleOCR/.../LICENSE -> PaddlePaddle-PaddleOCR.LICENSE.txt.
 */
export function licenseFileName(licenseUrl: string): string {
  const [owner, repo] = new URL(licenseUrl).pathname.split('/').filter(Boolean);
  return `${owner}-${repo}.LICENSE.txt`;
}
