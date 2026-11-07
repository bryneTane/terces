// Export the cloaked canvas as JPEG and verify it carries no metadata.
import exifr from 'exifr';
import { metadataIssues, stripMetadataSegments, type SegmentIssue } from './jpegSegments.ts';

export const JPEG_QUALITY = 0.92;

export interface Verification {
  ok: boolean;
  issues: SegmentIssue[];
}

export async function verifyNoMetadata(bytes: Uint8Array): Promise<Verification> {
  let issues: SegmentIssue[];
  try {
    issues = metadataIssues(bytes);
  } catch (e) {
    return { ok: false, issues: [{ marker: '-', reason: `unreadable JPEG: ${(e as Error).message}` }] };
  }
  try {
    const parsed = await exifr.parse(bytes, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      iptc: true,
      icc: false,
      jfif: false,
      ihdr: false,
      makerNote: true,
      userComment: true,
    });
    if (parsed && Object.keys(parsed).length)
      issues.push({ marker: 'exifr', reason: `fields: ${Object.keys(parsed).slice(0, 5).join(', ')}` });
  } catch {
    // exifr throws on files without any metadata blocks in some versions; the segment scan already ran.
  }
  return { ok: issues.length === 0, issues };
}

export async function canvasToJpeg(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY),
  );
}

/** Encode, strip encoder-added segments, then verify the exact bytes that will be shared. */
export async function exportVerified(canvas: OffscreenCanvas | HTMLCanvasElement) {
  const encoded = new Uint8Array(await (await canvasToJpeg(canvas)).arrayBuffer());
  const bytes = stripMetadataSegments(encoded);
  const verification = await verifyNoMetadata(bytes);
  return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }), verification };
}
