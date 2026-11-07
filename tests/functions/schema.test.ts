// @vitest-environment node
import { expect, test } from 'vitest';
import { createD1 } from './d1.ts';

test('daily_counts has exactly day, event, count', () => {
  const { raw } = createD1();
  const cols = raw
    .prepare('PRAGMA table_info(daily_counts)')
    .all()
    .map((c) => (c as { name: string }).name);
  expect(cols).toEqual(['day', 'event', 'count']);
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  expect(tables).toHaveLength(1);
});

test('unknown events and malformed days are rejected', () => {
  const { raw } = createD1();
  expect(() => raw.exec("INSERT INTO daily_counts VALUES ('2026-11-07', 'visit', 1)")).toThrow();
  expect(() => raw.exec("INSERT INTO daily_counts VALUES ('7/11/2026', 'scan', 1)")).toThrow();
  expect(() => raw.exec("INSERT INTO daily_counts VALUES ('2026-11-07', 'scan', -1)")).toThrow();
});
