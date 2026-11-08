import { describe, expect, it } from 'vitest';
import {
  licenseFileName,
  prepare,
  sha256,
  verifyOrPin,
  type ModelEntry,
} from '../../scripts/model-manifest.ts';
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
      expect(m.file).toMatch(/^(readers\/)?[a-z0-9.-]+$/);
    }
  });

  it('checks a converted download against the source pin, then the result against its own pin', () => {
    const yml = new TextEncoder().encode(
      "PostProcess:\n  character_dict:\n  - a\n  - ''''\n  - '0'\nOther: 1\n",
    );
    const dict = new TextEncoder().encode(JSON.stringify(['a', "'", '0']));
    const conv = entry({
      convert: 'paddle-dict',
      sourceSha256: sha256(yml),
      sourceBytes: yml.byteLength,
      sha256: sha256(dict),
      bytes: dict.byteLength,
    });
    const ok = prepare(conv, yml);
    expect(ok).toMatchObject({ ok: true, pinned: false });
    if (ok.ok) expect(JSON.parse(new TextDecoder().decode(ok.bytes))).toEqual(['a', "'", '0']);
    expect(prepare({ ...conv, sourceSha256: 'deadbeef' }, yml).ok).toBe(false);
    expect(prepare({ ...conv, sha256: 'deadbeef' }, yml).ok).toBe(false);
    const pinned = prepare({ ...conv, sourceSha256: '', sourceBytes: 0, sha256: '', bytes: 0 }, yml);
    expect(pinned).toMatchObject({
      ok: true,
      pinned: true,
      entry: { sourceSha256: sha256(yml), sha256: sha256(dict) },
    });
  });

  it('pins every reader to an exact PaddlePaddle commit, converted and checksummed', () => {
    const converted = manifest.models.filter((m) => /^ppocr-(rec|dict)-/.test(m.name));
    expect(converted.filter((m) => m.name.startsWith('ppocr-rec-'))).toHaveLength(10);
    for (const m of converted) {
      expect(m.url).toMatch(
        /^https:\/\/huggingface\.co\/PaddlePaddle\/[a-z_]*PP-OCRv5_mobile_rec_onnx\/resolve\/[0-9a-f]{40}\//,
      );
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect((m as { sourceSha256?: string }).sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('keeps one license file per source project', () => {
    const names = new Set(manifest.models.map((m) => licenseFileName(m.licenseUrl)));
    expect([...names].sort()).toEqual([
      'Megvii-BaseDetection-YOLOX.LICENSE.txt',
      'PaddlePaddle-PaddleOCR.LICENSE.txt',
      'opencv-face_detection_yunet.LICENSE.txt',
    ]);
  });
});
