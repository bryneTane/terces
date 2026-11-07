// Offline reverse geocoding: nearest town from GeoNames cities15000, served same-origin.
export type City = [name: string, country: string, lat: number, lon: number];

export interface Place {
  name: string;
  country: string;
  km: number;
}

export const CITIES_URL = '/geo/cities15000.min.json';
const EARTH_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearestPlace(lat: number, lon: number, cities: readonly City[]): Place | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const c of cities) {
    const km = haversineKm(lat, lon, c[2], c[3]);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  return best ? { name: best[0], country: best[1], km: bestKm } : null;
}

let cache: Promise<City[]> | null = null;

/** Lazy, memoized same-origin load. A failed load is not memoized, so it can be retried. */
export function loadCities(fetchFn: typeof fetch = fetch): Promise<City[]> {
  cache ??= fetchFn(CITIES_URL, { credentials: 'omit' })
    .then((r) => {
      if (!r.ok) throw new Error(`geo: HTTP ${r.status}`);
      return r.json() as Promise<City[]>;
    })
    .catch((e: unknown) => {
      cache = null;
      throw e;
    });
  return cache;
}

/** For tests. */
export function resetGeoCache() {
  cache = null;
}

/** "Lyon, FR", or null when the data cannot be loaded or no town is found. */
export async function placeLabel(
  lat: number,
  lon: number,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const p = nearestPlace(lat, lon, await loadCities(fetchFn));
    return p ? `${p.name}, ${p.country}` : null;
  } catch {
    return null;
  }
}
