import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { MAX_CHUNK, buildManifest, splitBuffer } from '../../scripts/ort-chunks.ts';

describe('ort chunking', () => {
  it('splits and reassembles losslessly', () => {
    const buf = new Uint8Array(25).map((_, i) => i);
    const parts = splitBuffer(buf, 10);
    expect(parts.map((p) => p.byteLength)).toEqual([10, 10, 5]);
    const joined = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
    let off = 0;
    for (const p of parts) {
      joined.set(p, off);
      off += p.byteLength;
    }
    expect(joined).toEqual(buf);
  });

  it('describes parts and checksum', () => {
    const { manifest } = buildManifest('1.0.0', 'g.mjs', 'x.wasm', new Uint8Array(15), 10);
    expect(manifest.parts).toEqual(['x.wasm.part0', 'x.wasm.part1']);
    expect(manifest.bytes).toBe(15);
  });

  it('copy-ort writes the expected files, every part under the limit', () => {
    execFileSync('pnpm', ['exec', 'tsx', 'scripts/copy-ort.ts'], { stdio: 'ignore' });
    const m = JSON.parse(readFileSync('public/ort/manifest.json', 'utf8')) as {
      glue: string;
      parts: string[];
      sha256: string;
      bytes: number;
    };
    expect(existsSync(`public/ort/${m.glue}`)).toBe(true);
    const hash = createHash('sha256');
    let total = 0;
    for (const p of m.parts) {
      const size = statSync(`public/ort/${p}`).size;
      expect(size).toBeLessThanOrEqual(MAX_CHUNK);
      total += size;
      hash.update(readFileSync(`public/ort/${p}`));
    }
    expect(total).toBe(m.bytes);
    expect(hash.digest('hex')).toBe(m.sha256);
  }, 60_000);
});
