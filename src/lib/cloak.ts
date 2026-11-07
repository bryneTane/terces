// Cloak: render masks at full resolution, export JPEG, verify, summarise.
import { exportVerified } from './export.ts';
import { readsPixels, renderCloak, type Ctx2D, type MaskStyle, type MaskStyles } from './mask.ts';
import type { CloakResult, CloakSummary, MetadataFinding, Zone } from './types.ts';

export function summarize(zones: Zone[], metadata: MetadataFinding[]): CloakSummary {
  const count = (c: Zone['category']) => zones.filter((z) => z.selected && z.category === c).length;
  return {
    metadataRemoved: metadata.length,
    faces: count('face'),
    text: count('text'),
    plates: count('plate'),
    manual: count('manual'),
  };
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export async function cloak(
  bitmap: ImageBitmap,
  zones: Zone[],
  metadata: MetadataFinding[],
  style: MaskStyle | MaskStyles = {},
): Promise<CloakResult> {
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: readsPixels(style) }) as unknown as Ctx2D | null;
  if (!ctx) throw new Error('2d context unavailable');
  renderCloak(ctx, bitmap, bitmap.width, bitmap.height, zones, style);
  const { blob, verification } = await exportVerified(canvas);
  if ('width' in canvas && canvas instanceof HTMLCanvasElement) canvas.width = 0; // free memory early
  return {
    blob,
    url: URL.createObjectURL(blob),
    width: bitmap.width,
    height: bitmap.height,
    verified: verification.ok,
    summary: summarize(zones, metadata),
  };
}
