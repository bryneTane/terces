// Findings -> mask zones.
import type { Rect, VisualFinding, Zone } from './types.ts';

export const ZONE_PADDING = 0.08;
export const TEXT_MERGE_IOU = 0.3;

function iou(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function pad(r: Rect, ratio: number, width: number, height: number): Rect {
  const dx = r.w * ratio;
  const dy = r.h * ratio;
  const x = Math.max(0, r.x - dx);
  const y = Math.max(0, r.y - dy);
  return { x, y, w: Math.min(width, r.x + r.w + dx) - x, h: Math.min(height, r.y + r.h + dy) - y };
}

/** Merge overlapping text boxes (IoU > 0.3) so one line of text becomes one zone. */
export function mergeText(findings: VisualFinding[]): VisualFinding[] {
  const out: VisualFinding[] = [];
  for (const f of findings) {
    const hit = out.find((o) => iou(o.box, f.box) > TEXT_MERGE_IOU);
    if (hit) {
      hit.box = union(hit.box, f.box);
      hit.score = Math.max(hit.score, f.score);
      if (f.text) hit.text = hit.text ? `${hit.text} ${f.text}` : f.text;
    } else out.push({ ...f, box: { ...f.box } });
  }
  return out;
}

export function findingsToZones(visual: VisualFinding[], width: number, height: number): Zone[] {
  const plates = mergeText(visual.filter((f) => f.category === 'plate'));
  const merged = mergeText(visual.filter((f) => f.category === 'text'));
  const text = [...plates, ...(merged.length > TEXT_GROUP_THRESHOLD ? groupLines(merged) : merged)];
  const others = visual.filter((f) => f.category !== 'text' && f.category !== 'plate');
  return [...others, ...text].map((f) => ({
    id: `zone-${f.id}`,
    findingId: f.id,
    kind: 'detected',
    category: f.category,
    rect: pad(f.box, ZONE_PADDING, width, height),
    selected: f.category !== 'person',
    ...(f.text ? { text: f.text } : {}),
  }));
}

// ---- Editing ----

export const MIN_MANUAL_SIDE = 16;
/** Above this many text zones, text is grouped by line so a group toggles as one (dense text). */
export const TEXT_GROUP_THRESHOLD = 60;

export function toggleZone(zones: Zone[], id: string): Zone[] {
  return zones.map((z) => (z.id === id ? { ...z, selected: !z.selected } : z));
}

let manualSeq = 0;
/** Adds a hand-drawn zone (normalized, clamped, at least 16 px per side in image pixels). Returns the same array when too small. */
export function addManualZone(zones: Zone[], r: Rect, width: number, height: number): Zone[] {
  const x0 = Math.max(0, Math.min(r.x, r.x + r.w));
  const y0 = Math.max(0, Math.min(r.y, r.y + r.h));
  const x1 = Math.min(width, Math.max(r.x, r.x + r.w));
  const y1 = Math.min(height, Math.max(r.y, r.y + r.h));
  if (x1 - x0 < MIN_MANUAL_SIDE || y1 - y0 < MIN_MANUAL_SIDE) return zones;
  return [
    ...zones,
    {
      id: `manual-${Date.now().toString(36)}-${manualSeq++}`,
      kind: 'manual',
      category: 'manual',
      rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      selected: true,
    },
  ];
}

/** Only hand-drawn zones can be removed; detected zones are toggled instead. */
export function removeZone(zones: Zone[], id: string): Zone[] {
  return zones.filter((z) => z.id !== id || z.kind !== 'manual');
}

/** The smallest zone containing the point, so nested zones stay reachable. */
export function hitTest(zones: Zone[], x: number, y: number): Zone | null {
  let best: Zone | null = null;
  for (const z of zones) {
    const r = z.rect;
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue;
    if (!best || r.w * r.h < best.rect.w * best.rect.h) best = z;
  }
  return best;
}

/** Group text findings into lines: boxes whose vertical extents overlap by half the smaller height. */
export function groupLines(findings: VisualFinding[]): VisualFinding[] {
  const sorted = [...findings].sort((a, b) => a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2));
  const lines: VisualFinding[] = [];
  for (const f of sorted) {
    const line = lines.find((l) => {
      const overlap = Math.min(l.box.y + l.box.h, f.box.y + f.box.h) - Math.max(l.box.y, f.box.y);
      return overlap > 0.5 * Math.min(l.box.h, f.box.h);
    });
    if (line) {
      line.box = union(line.box, f.box);
      line.score = Math.max(line.score, f.score);
      if (f.text) line.text = line.text ? `${line.text} ${f.text}` : f.text;
    } else lines.push({ ...f, box: { ...f.box } });
  }
  return lines;
}

/** Gives a zone a new rectangle (clamped to the image). Returns the same array when too small. */
export function resizeZone(zones: Zone[], id: string, r: Rect, width: number, height: number): Zone[] {
  const x0 = Math.max(0, Math.min(r.x, r.x + r.w));
  const y0 = Math.max(0, Math.min(r.y, r.y + r.h));
  const x1 = Math.min(width, Math.max(r.x, r.x + r.w));
  const y1 = Math.min(height, Math.max(r.y, r.y + r.h));
  if (x1 - x0 < MIN_MANUAL_SIDE || y1 - y0 < MIN_MANUAL_SIDE) return zones;
  return zones.map((z) => (z.id === id ? { ...z, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } } : z));
}
