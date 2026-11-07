// Minimal structural types for the Pages Function bindings, so the handlers can be tested
// in Node against a SQLite-backed stand-in for D1.
export interface D1Result<T> {
  results: T[];
}
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
export interface D1Like {
  prepare(sql: string): D1Statement;
}
export interface Env {
  DB: D1Like;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}
export interface Context {
  request: Request;
  env: Env;
}

export const EVENTS = ['scan', 'cloak'] as const;
export type UsageEvent = (typeof EVENTS)[number];

/** UTC day, YYYY-MM-DD. */
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
