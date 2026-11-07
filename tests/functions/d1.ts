// A small D1 stand-in over node:sqlite, with the real migrations applied.
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { D1Like, D1Statement } from '../../functions/_lib/env.ts';

export function createD1(): D1Like & { raw: DatabaseSync; fail: boolean } {
  const raw = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').sort()) raw.exec(readFileSync(`migrations/${f}`, 'utf8'));
  const db = {
    raw,
    fail: false,
    prepare(sql: string): D1Statement {
      let params: unknown[] = [];
      const guard = () => {
        if (db.fail) throw new Error('D1_ERROR: simulated');
      };
      const stmt: D1Statement = {
        bind: (...v) => ((params = v), stmt),
        run: async () => (guard(), raw.prepare(sql).run(...(params as never[]))),
        all: async <T>() => (guard(), { results: raw.prepare(sql).all(...(params as never[])) as T[] }),
        first: async <T>() => (guard(), (raw.prepare(sql).get(...(params as never[])) as T) ?? null),
      };
      return stmt;
    },
  };
  return db;
}
