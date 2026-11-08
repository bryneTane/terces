// Downloads every model and ONNX Runtime file into Cache Storage once, so the next visit works
// with the network off. The service worker serves the same cache (CacheFirst).
export const MODEL_CACHE_PREFIX = 'terces-models-';

export interface CacheDeps {
  caches: CacheStorage;
  fetch: typeof fetch;
  name: string;
}

export interface CacheFile {
  url: string;
  bytes: number;
}

const defaultDeps = (): CacheDeps => ({
  caches: globalThis.caches,
  fetch: (...a) => globalThis.fetch(...a),
  name: __MODEL_CACHE__,
});

/**
 * Every file the scanner needs, from the two manifests (which are cached too). Readers for other
 * alphabets (models/readers/) are left out: the scanner fetches them the first time a photo has
 * text, and the service worker keeps them for offline use from then on.
 */
export async function listModelFiles(fetchFn: typeof fetch): Promise<CacheFile[]> {
  const models = (await (await fetchFn('/models/manifest.json')).json()) as {
    models: { file: string; bytes: number }[];
  };
  const ort = (await (await fetchFn('/ort/manifest.json')).json()) as {
    glue: string;
    parts: string[];
    bytes: number;
  };
  const partBytes = Math.ceil(ort.bytes / Math.max(1, ort.parts.length));
  return [
    { url: '/models/manifest.json', bytes: 0 },
    { url: '/ort/manifest.json', bytes: 0 },
    ...models.models
      .filter((m) => !m.file.startsWith('readers/'))
      .map((m) => ({ url: `/models/${m.file}`, bytes: m.bytes })),
    { url: `/ort/${ort.glue}`, bytes: 0 },
    ...ort.parts.map((p) => ({ url: `/ort/${p}`, bytes: partBytes })),
  ];
}

/** Deletes caches from older model or runtime versions. */
export async function dropOldCaches(deps: Pick<CacheDeps, 'caches' | 'name'>): Promise<string[]> {
  const old = (await deps.caches.keys()).filter((k) => k.startsWith(MODEL_CACHE_PREFIX) && k !== deps.name);
  await Promise.all(old.map((k) => deps.caches.delete(k)));
  return old;
}

/**
 * Fills the cache, skipping files already there. Running it while a scan is in flight stalled
 * the scan in Chromium (seen in tests), so callers pass `idle` to keep the two apart. Progress is in bytes. Resolves true when every
 * file is cached. Never throws: without Cache Storage (private mode) the app still works online.
 */
export async function warmModelCache(
  onProgress?: (loaded: number, total: number) => void,
  deps: CacheDeps = defaultDeps(),
  /** Awaited before each file: lets the app hold the download while a scan or cloak runs. */
  idle: () => Promise<void> = async () => {},
): Promise<boolean> {
  try {
    if (!deps.caches) return false;
    await dropOldCaches(deps);
    const cache = await deps.caches.open(deps.name);
    const files = await listModelFiles(deps.fetch);
    const total = files.reduce((a, f) => a + f.bytes, 0);
    let loaded = 0;
    for (const f of files) {
      await idle();
      if (!(await cache.match(f.url))) {
        const res = await deps.fetch(f.url);
        if (!res.ok) return false;
        await cache.put(f.url, res);
      }
      loaded += f.bytes;
      onProgress?.(loaded, total);
    }
    return true;
  } catch {
    return false;
  }
}
