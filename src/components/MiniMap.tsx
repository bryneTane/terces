import { useEffect, useState } from 'react';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { useI18n } from '../i18n.tsx';

export const WORLD_URL = '/geo/countries-110m.json';
export const SPAN_LON = 40;
export const SPAN_LAT = 20;
const W = 320;
const H = 160;

type Ring = [number, number][];
export type World = Ring[];

/** Flattens the TopoJSON countries into polygon rings ([lon, lat] points). */
export function worldRings(topo: Topology): World {
  const fc = feature(topo, topo.objects.countries!) as unknown as {
    features: { geometry: { type: string; coordinates: unknown } | null }[];
  };
  const rings: World = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys =
      g.type === 'Polygon'
        ? [g.coordinates as Ring[]]
        : g.type === 'MultiPolygon'
          ? (g.coordinates as Ring[][])
          : [];
    for (const p of polys) rings.push(...p);
  }
  return rings;
}

let cache: Promise<World> | null = null;
const loadWorld = (): Promise<World> => {
  cache ??= fetch(WORLD_URL, { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((t: Topology) => worldRings(t));
  cache.catch(() => (cache = null));
  return cache;
};

/** Equirectangular window of SPAN_LON x SPAN_LAT degrees centred on the point. */
export function project(lat0: number, lon0: number) {
  return ([lon, lat]: [number, number]): [number, number] => [
    ((lon - lon0 + SPAN_LON / 2) / SPAN_LON) * W,
    ((lat0 + SPAN_LAT / 2 - lat) / SPAN_LAT) * H,
  ];
}

export function ringsPath(rings: World, lat: number, lon: number): string {
  const p = project(lat, lon);
  const out: string[] = [];
  for (const r of rings) {
    // Skip rings entirely outside the window (with a margin).
    let inside = false;
    for (const [x, y] of r) {
      if (Math.abs(x - lon) < SPAN_LON / 2 + 5 && Math.abs(y - lat) < SPAN_LAT / 2 + 5) {
        inside = true;
        break;
      }
    }
    if (!inside) continue;
    out.push(
      r.map((pt, i) => `${i ? 'L' : 'M'}${p(pt)[0].toFixed(1)},${p(pt)[1].toFixed(1)}`).join('') + 'Z',
    );
  }
  return out.join('');
}

const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;

/** World outline around the photo's location, with a pulsing target. Offline, same-origin data. */
export function MiniMap({
  lat,
  lon,
  load = loadWorld,
}: {
  lat: number;
  lon: number;
  load?: () => Promise<World>;
}) {
  const { t } = useI18n();
  const [world, setWorld] = useState<World | null>(null);
  useEffect(() => {
    let live = true;
    load()
      .then((w) => live && setWorld(w))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [load]);

  return (
    <figure className="hud-panel m-0 overflow-hidden" data-testid="minimap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`${lat.toFixed(4)}, ${lon.toFixed(4)}`}
      >
        <defs>
          <pattern id="mm-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0H0V16" fill="none" className="stroke-line" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#mm-grid)" />
        {world && (
          <path
            d={ringsPath(world, lat, lon)}
            data-testid="land"
            className="fill-accent/10 stroke-accent/60"
            strokeWidth="0.6"
          />
        )}
        <line x1={W / 2} x2={W / 2} y1={0} y2={H} className="stroke-alert/40" strokeWidth="0.5" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-alert/40" strokeWidth="0.5" />
        <circle cx={W / 2} cy={H / 2} r="4" className="pulse-ring fill-none stroke-alert" strokeWidth="1" />
        <circle cx={W / 2} cy={H / 2} r="2.5" data-testid="target" className="fill-alert" />
      </svg>
      <figcaption className="flex justify-between border-t border-line px-2 py-1 font-mono text-[10px] tracking-widest text-muted">
        <span>
          {t('intel.lat')} {fmt(lat, 'N', 'S')}
        </span>
        <span>
          {t('intel.lon')} {fmt(lon, 'E', 'W')}
        </span>
      </figcaption>
    </figure>
  );
}
