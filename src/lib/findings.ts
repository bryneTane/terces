// Report rows and the findings count: every listed row counts once, so the number shown
// always equals the rows shown.
import type { MetadataFinding, VisualFinding } from './types.ts';

export type VisualCategory = VisualFinding['category'];
export const VISUAL_ORDER: VisualCategory[] = ['face', 'plate', 'text', 'person'];

export type ReportRow =
  | { kind: 'metadata'; key: string; finding: MetadataFinding }
  | { kind: 'visual'; key: string; finding: VisualFinding };

export function reportRows(metadata: MetadataFinding[], visual: VisualFinding[]): ReportRow[] {
  const rank = (c: VisualCategory) => VISUAL_ORDER.indexOf(c);
  const sorted = [...visual].sort(
    (a, b) => rank(a.category) - rank(b.category) || b.box.w * b.box.h - a.box.w * a.box.h,
  );
  return [
    ...metadata.map((finding): ReportRow => ({ kind: 'metadata', key: `m:${finding.group}`, finding })),
    ...sorted.map((finding): ReportRow => ({ kind: 'visual', key: `v:${finding.id}`, finding })),
  ];
}

export function findingsCount(metadata: MetadataFinding[], visual: VisualFinding[]): number {
  return reportRows(metadata, visual).length;
}

export function countByCategory(visual: VisualFinding[]): Record<VisualCategory, number> {
  const out: Record<VisualCategory, number> = { face: 0, plate: 0, text: 0, person: 0 };
  for (const f of visual) out[f.category]++;
  return out;
}
