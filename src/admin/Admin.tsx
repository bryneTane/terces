// The usage dashboard: stat tiles and the 30 day chart, fed by /admin/stats.
import { useEffect, useState } from 'react';
import { BarChart, type DayCount } from './Chart.tsx';

export interface Stats {
  today: DayCount;
  days: DayCount[];
  total: { scan: number; cloak: number };
  cloakRate: number | null;
}

export type State =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; stats: Stats };

const fmt = new Intl.NumberFormat('en');

async function loadStats(): Promise<State> {
  // The Vite dev server has no Functions: /admin/stats would return the app's HTML.
  if (import.meta.env.DEV)
    return {
      kind: 'error',
      message:
        'The dev server has no stats API. Run "pnpm build && pnpm wrangler pages dev dist" to see real numbers.',
    };
  try {
    const r = await fetch('/admin/stats', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401)
      return { kind: 'error', message: 'Not authorized. Sign in through Cloudflare Access and reload.' };
    if (!r.ok) return { kind: 'error', message: `Could not load stats (HTTP ${r.status}).` };
    return { kind: 'ready', stats: (await r.json()) as Stats };
  } catch {
    return { kind: 'error', message: 'Could not load stats. Check your connection and reload.' };
  }
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function Dashboard({ stats }: { stats: Stats }) {
  return (
    <>
      <h1>Terces usage</h1>
      <div className="tiles">
        <Tile label="Scanned today" value={fmt.format(stats.today.scan)} />
        <Tile label="Cloaked today" value={fmt.format(stats.today.cloak)} />
        <Tile label="Scanned, all time" value={fmt.format(stats.total.scan)} />
        <Tile label="Cloaked, all time" value={fmt.format(stats.total.cloak)} />
        <Tile
          label="Cloak rate"
          value={stats.cloakRate === null ? 'n/a' : `${Math.round(stats.cloakRate * 100)}%`}
        />
      </div>
      <section className="panel">
        <div className="legend">
          <span>
            <i className="scan" />
            Scanned
          </span>
          <span>
            <i className="cloak" />
            Cloaked
          </span>
          <span>Last 30 days, UTC</span>
        </div>
        <BarChart days={stats.days} />
      </section>
    </>
  );
}

export function Admin({ load = loadStats }: { load?: () => Promise<State> }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    void load().then(setState);
  }, [load]);
  if (state.kind === 'loading') return <p className="status">Loading…</p>;
  if (state.kind === 'error') return <p className="status error">{state.message}</p>;
  return <Dashboard stats={state.stats} />;
}
