import { expect, test } from 'vitest';
import { countByCategory, findingsCount, reportRows } from '../../src/lib/findings.ts';
import type { MetadataFinding, VisualFinding } from '../../src/lib/types.ts';

const m = (group: MetadataFinding['group']): MetadataFinding => ({
  group,
  label: `meta.${group}`,
  value: 'x',
  raw: {},
});
const v = (id: string, category: VisualFinding['category'], w = 10): VisualFinding => ({
  id,
  category,
  box: { x: 0, y: 0, w, h: 10 },
  score: 1,
  source: 'yunet',
});

test('the count equals the rows listed', () => {
  const metadata = [m('location'), m('device')];
  const visual = [v('t1', 'text'), v('f1', 'face'), v('p1', 'person'), v('pl', 'plate'), v('f2', 'face', 50)];
  const rows = reportRows(metadata, visual);
  expect(findingsCount(metadata, visual)).toBe(rows.length);
  expect(rows).toHaveLength(7);
  expect(rows.map((r) => r.key)).toEqual(['m:location', 'm:device', 'v:f2', 'v:f1', 'v:pl', 'v:t1', 'v:p1']);
});

test('nothing found is zero', () => {
  expect(findingsCount([], [])).toBe(0);
});

test('counts per category', () => {
  expect(countByCategory([v('a', 'face'), v('b', 'face'), v('c', 'plate')])).toEqual({
    face: 2,
    plate: 1,
    text: 0,
    person: 0,
  });
});
