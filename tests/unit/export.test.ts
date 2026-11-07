// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { verifyNoMetadata } from '../../src/lib/export.ts';
import { metadataIssues, readSegments, stripMetadataSegments } from '../../src/lib/jpegSegments.ts';

const file = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`));

/** Minimal JPEG: SOI, APP0 JFIF, then the body of a real encoded image. */
function cleanJpeg(): Uint8Array {
  const c = createCanvas(16, 16);
  c.getContext('2d').fillRect(0, 0, 8, 8);
  const encoded = new Uint8Array(c.toBuffer('image/jpeg', 90));
  // strip APP1-APP15 and COM segments the encoder may add, keep everything else
  const segs = readSegments(encoded);
  const parts: Uint8Array[] = [encoded.subarray(0, 2)];
  for (const s of segs)
    if (!((s.marker >= 0xe1 && s.marker <= 0xef) || s.marker === 0xfe))
      parts.push(encoded.subarray(s.offset, s.offset + 2 + s.length));
  const last = segs[segs.length - 1]!;
  parts.push(encoded.subarray(last.offset + 2 + last.length));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe('export verification', () => {
  it('rejects a photo with EXIF and GPS', async () => {
    const v = await verifyNoMetadata(file('street-gps.jpg'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.reason)).toContain('EXIF');
  });

  it('accepts a clean JPEG', async () => {
    const bytes = cleanJpeg();
    expect(metadataIssues(bytes)).toEqual([]);
    expect(await verifyNoMetadata(bytes)).toEqual({ ok: true, issues: [] });
  });

  it('rejects comments and non-JPEG input', async () => {
    const bytes = cleanJpeg();
    const com = new Uint8Array([0xff, 0xfe, 0x00, 0x07, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
    const withCom = new Uint8Array(bytes.length + com.length);
    withCom.set(bytes.subarray(0, 2));
    withCom.set(com, 2);
    withCom.set(bytes.subarray(2), 2 + com.length);
    expect((await verifyNoMetadata(withCom)).ok).toBe(false);
    expect((await verifyNoMetadata(new Uint8Array([1, 2, 3]))).ok).toBe(false);
  });

  it('strips EXIF, GPS and other APP segments without touching the image data', async () => {
    const src = file('street-gps.jpg');
    const out = stripMetadataSegments(src);
    expect(await verifyNoMetadata(out)).toEqual({ ok: true, issues: [] });
    const sos = (b: Uint8Array) => readSegments(b).at(-1)!;
    const tail = (b: Uint8Array) => b.subarray(sos(b).offset);
    expect(tail(out)).toEqual(tail(src)); // compressed pixels are byte-identical
  });

  it('strips the Exif and Photoshop blocks a WebKit encoder adds', async () => {
    const base = cleanJpeg();
    const seg = (marker: number, id: string) => {
      const body = new TextEncoder().encode(id + '\0padding');
      return new Uint8Array([0xff, marker, 0, body.length + 2, ...body]);
    };
    const extra = [seg(0xe1, 'Exif'), seg(0xed, 'Photoshop 3.0')];
    const withApps = new Uint8Array(base.length + extra.reduce((n, e) => n + e.length, 0));
    withApps.set(base.subarray(0, 2));
    let o = 2;
    for (const e of extra) {
      withApps.set(e, o);
      o += e.length;
    }
    withApps.set(base.subarray(2), o);
    expect((await verifyNoMetadata(withApps)).ok).toBe(false);
    expect((await verifyNoMetadata(stripMetadataSegments(withApps))).ok).toBe(true);
  });
});

describe('unreadable encoder output', () => {
  it('is passed through by the stripper and rejected by verification', async () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    expect(stripMetadataSegments(junk)).toBe(junk);
    expect((await verifyNoMetadata(junk)).ok).toBe(false);
  });
});

it('rejects a truncated JPEG with no image data', async () => {
  expect((await verifyNoMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).ok).toBe(false);
  expect((await verifyNoMetadata(new Uint8Array([0xff, 0xd8]))).ok).toBe(false);
});
