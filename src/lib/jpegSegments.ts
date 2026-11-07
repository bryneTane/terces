// Byte-level JPEG segment scan: the independent half of export verification.

export interface Segment {
  marker: number;
  offset: number;
  length: number;
  id: string;
}

export function readSegments(bytes: Uint8Array): Segment[] {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG');
  const segs: Segment[] = [];
  let p = 2;
  let scan = false;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) throw new Error(`bad marker at ${p}`);
    const marker = bytes[p + 1]!;
    if (marker === 0xda) {
      scan = true; // start of scan: entropy-coded data follows, no metadata segments after this point
      break;
    }
    if (marker === 0xd9) break;
    const length = (bytes[p + 2]! << 8) | bytes[p + 3]!;
    let id = '';
    for (let i = p + 4; i < Math.min(p + 4 + 14, bytes.length) && bytes[i] !== 0; i++)
      id += String.fromCharCode(bytes[i]!);
    segs.push({ marker, offset: p, length, id });
    p += 2 + length;
  }
  // A file that ends before any image data is truncated: never treat it as clean.
  if (!scan) throw new Error('no image data');
  return segs;
}

/** True when an embedded ICC profile is a standard, non-identifying sRGB profile. */
export function isStandardSrgbIcc(bytes: Uint8Array, seg: Segment): boolean {
  if (!seg.id.startsWith('ICC_PROFILE')) return false;
  const start = seg.offset + 4 + 14; // "ICC_PROFILE\0" + seq + count
  const end = seg.offset + 2 + seg.length;
  let text = '';
  for (let i = start; i < end; i++) {
    const c = bytes[i]!;
    if (c >= 0x20 && c < 0x7f) text += String.fromCharCode(c);
  }
  return /sRGB/.test(text);
}

export interface SegmentIssue {
  marker: string;
  reason: string;
}

const ALLOWED = new Set([0xdb, 0xc0, 0xc1, 0xc2, 0xc4, 0xdd, 0xe0 /* APP0 JFIF */, 0xee /* APP14 Adobe */]);

export function metadataIssues(bytes: Uint8Array): SegmentIssue[] {
  const issues: SegmentIssue[] = [];
  for (const s of readSegments(bytes)) {
    const name = `0xFF${s.marker.toString(16).toUpperCase()}`;
    if (ALLOWED.has(s.marker)) continue;
    if (s.marker === 0xe2 && isStandardSrgbIcc(bytes, s)) continue;
    if (s.marker === 0xe1)
      issues.push({ marker: name, reason: s.id.startsWith('Exif') ? 'EXIF' : 'XMP or other APP1' });
    else if (s.marker === 0xed) issues.push({ marker: name, reason: 'IPTC / Photoshop' });
    else if (s.marker === 0xe2)
      issues.push({ marker: name, reason: `APP2 ${s.id || 'unknown'} (non-sRGB ICC or MPF)` });
    else if (s.marker === 0xfe) issues.push({ marker: name, reason: 'comment' });
    else if (s.marker >= 0xe0 && s.marker <= 0xef)
      issues.push({ marker: name, reason: `APP${s.marker - 0xe0} ${s.id}` });
  }
  return issues;
}

/** Segments kept by the stripper: JFIF (APP0) and Adobe (APP14, affects colour decoding). */
const KEEP_APP = new Set([0xe0, 0xee]);

/**
 * Remove every APPn segment except APP0/APP14, and every comment, without re-encoding pixels.
 * Browsers' encoders add their own blocks (WebKit/ImageIO writes Exif and Photoshop/IPTC APPs),
 * so the output is normalised before verification. Unreadable input is returned unchanged:
 * verification then rejects it, which blocks sharing.
 */
export function stripMetadataSegments(bytes: Uint8Array): Uint8Array {
  let segs: Segment[];
  try {
    segs = readSegments(bytes);
  } catch {
    return bytes;
  }
  const drop = segs.filter(
    (s) => (s.marker >= 0xe1 && s.marker <= 0xef && !KEEP_APP.has(s.marker)) || s.marker === 0xfe,
  );
  if (!drop.length) return bytes;
  const out = new Uint8Array(bytes.length - drop.reduce((n, s) => n + 2 + s.length, 0));
  let o = 0;
  let p = 0;
  for (const s of drop) {
    out.set(bytes.subarray(p, s.offset), o);
    o += s.offset - p;
    p = s.offset + 2 + s.length;
  }
  out.set(bytes.subarray(p), o);
  return out;
}
