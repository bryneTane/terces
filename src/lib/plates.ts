// Licence plate rule: reclassify OCR text findings as plates (no dedicated plate model).
import { iou } from '../worker/models/common.ts';
import type { Rect, VisualFinding } from './types.ts';

export const PLATE_PATTERN = /^[A-Z0-9]{1,3}[- ]?[A-Z0-9]{2,4}[- ]?[A-Z0-9]{0,3}$/;
const VEHICLE_IOU = 0.1;
/** Refinement: a plate is tiny next to its car, so IoU stays far below 0.1. Also accept a text box
 * that lies mostly inside a vehicle box (intersection over text area). */
const INSIDE_RATIO = 0.5;

export function normalizePlateText(text: string): string {
  return text.toUpperCase().replace(/[.·•]/g, ' ').replace(/\s+/g, ' ').trim();
}

function insideRatio(t: Rect, v: Rect): number {
  const w = Math.max(0, Math.min(t.x + t.w, v.x + v.w) - Math.max(t.x, v.x));
  const h = Math.max(0, Math.min(t.y + t.h, v.y + v.h) - Math.max(t.y, v.y));
  return t.w * t.h > 0 ? (w * h) / (t.w * t.h) : 0;
}

export function looksLikePlateText(text: string | undefined): boolean {
  if (!text) return false;
  const t = normalizePlateText(text);
  return /[0-9]/.test(t) && PLATE_PATTERN.test(t);
}

export function isPlate(finding: Pick<VisualFinding, 'box' | 'text'>, vehicles: Rect[]): boolean {
  const b = finding.box;
  if (vehicles.some((v) => iou(b, v) > VEHICLE_IOU || insideRatio(b, v) > INSIDE_RATIO)) return true;
  const aspect = b.h > 0 ? b.w / b.h : 0;
  return aspect >= 2 && aspect <= 6 && looksLikePlateText(finding.text);
}

/** Returns only the findings that change: text findings re-labelled as plates. */
export function reclassifyPlates(textFindings: VisualFinding[], vehicles: Rect[]): VisualFinding[] {
  return textFindings
    .filter((f) => f.category === 'text' && isPlate(f, vehicles))
    .map((f) => ({ ...f, category: 'plate' as const, source: 'plate-rule' as const }));
}
