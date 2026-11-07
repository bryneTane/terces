// Builds the offline geo data used for "near {place}" and the mini map.
// Sources (cached in scripts/.cache/geo/, sha256-pinned):
// - Natural Earth 1:110m countries, as TopoJSON from the world-atlas package (public domain)
// - GeoNames cities15000 (CC-BY 4.0)
// GeoNames republishes its dumps daily, so a fresh download will not match the pin. The output
// in public/geo/ is committed; rebuild only on purpose, with `pnpm geo:build --repin`.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const cacheDir = join(root, 'scripts/.cache/geo');
const outDir = join(root, 'public/geo');
mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

export const SOURCES = {
  countries: {
    file: 'world-atlas/countries-110m.json',
    sha256: '2516c915867c7baf18ddec727aec46c315541a07cfb3d79a6559b05d5e94eee8',
  },
  cities: {
    url: 'https://download.geonames.org/export/dump/cities15000.zip',
    sha256: '37d3b39e88167155539dc4aaf93886527c5037b6a822087e48fe530baf8436b7',
  },
};

const repin = process.argv.includes('--repin');
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function check(name: string, bytes: Uint8Array, pinned: string) {
  const got = sha256(bytes);
  if (got === pinned) return;
  if (repin) {
    console.log(`${name}: new sha256 ${got} (update SOURCES in scripts/build-geo.ts)`);
    return;
  }
  console.error(`${name}: sha256 mismatch, expected ${pinned}, got ${got}. Use --repin to accept.`);
  process.exit(1);
}

/**
 * Compact city rows: [name, countryCode, lat, lon], 4 decimals. Sections of a city are dropped so
 * the label is the town itself: feature code PPLX, and numbered districts such as "Lyon 01" or
 * "Paris 04 Hôtel-de-Ville" when the base town exists in the same country.
 */
export function parseCities(tsv: string): [string, string, number, number][] {
  const rows: [string, string, number, number][] = [];
  for (const line of tsv.split('\n')) {
    const c = line.split('\t');
    if (c.length < 9 || c[7] === 'PPLX') continue;
    const lat = Number(c[4]);
    const lon = Number(c[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    rows.push([c[1]!, c[8]!, Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4]);
  }
  const names = new Set(rows.map(([n, cc]) => `${cc}|${n}`));
  return rows.filter(([n, cc]) => {
    const m = /^(.*\S) \d{1,2}(?: .*)?$/.exec(n);
    return !(m && names.has(`${cc}|${m[1]}`));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const require = createRequire(import.meta.url);
  const countriesPath = require.resolve(SOURCES.countries.file);
  check('countries-110m', new Uint8Array(readFileSync(countriesPath)), SOURCES.countries.sha256);
  copyFileSync(countriesPath, join(outDir, 'countries-110m.json'));

  const zipPath = join(cacheDir, 'cities15000.zip');
  if (!existsSync(zipPath) || repin) {
    const res = await fetch(SOURCES.cities.url);
    if (!res.ok) throw new Error(`GET ${SOURCES.cities.url}: ${res.status}`);
    writeFileSync(zipPath, new Uint8Array(await res.arrayBuffer()));
  }
  const zip = new Uint8Array(readFileSync(zipPath));
  check('cities15000', zip, SOURCES.cities.sha256);
  const txt = unzipSync(zip)['cities15000.txt'];
  if (!txt) throw new Error('cities15000.txt missing from archive');
  const rows = parseCities(new TextDecoder().decode(txt));
  writeFileSync(join(outDir, 'cities15000.min.json'), JSON.stringify(rows));
  console.log(`geo ready in public/geo: ${rows.length} cities`);
}
