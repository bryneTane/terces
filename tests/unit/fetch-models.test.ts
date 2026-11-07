import { describe, expect, it } from 'vitest';
import { sha256, verifyOrPin, type ModelEntry } from '../../scripts/model-manifest.ts';
import manifest from '../../models/manifest.json';

const bytes = new TextEncoder().encode('fake model bytes');
const entry = (over: Partial<ModelEntry> = {}): ModelEntry => ({
  name: 'm',
  file: 'm.onnx',
  url: 'https://example.invalid/m.onnx',
  bytes: bytes.byteLength,
  sha256: sha256(bytes),
  license: 'MIT',
  licenseUrl: 'https://example.invalid/LICENSE',
  source: 'test',
  ...over,
});

describe('model manifest', () => {
  it('accepts matching bytes', () => {
    expect(verifyOrPin(entry(), bytes)).toMatchObject({ ok: true, pinned: false });
  });

  it('pins an entry without a hash', () => {
    const r = verifyOrPin(entry({ sha256: '', bytes: 0 }), bytes);
    expect(r).toMatchObject({ ok: true, pinned: true });
    if (r.ok) expect(r.entry.sha256).toBe(sha256(bytes));
  });

  it('rejects a hash mismatch', () => {
    expect(verifyOrPin(entry({ sha256: 'deadbeef' }), bytes).ok).toBe(false);
  });

  it('rejects non-permissive licenses', () => {
    expect(verifyOrPin(entry({ license: 'AGPL-3.0' }), bytes).ok).toBe(false);
  });

  it('only lists permissive licenses and same-origin file names', () => {
    for (const m of manifest.models) {
      expect(['MIT', 'Apache-2.0']).toContain(m.license);
      expect(m.file).toMatch(/^[a-z0-9.-]+$/);
    }
  });
});
