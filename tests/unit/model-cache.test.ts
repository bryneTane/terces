import { describe, expect, it, vi } from 'vitest';
import { dropOldCaches, listModelFiles, warmModelCache } from '../../src/lib/modelCache.ts';

class FakeCache {
  store = new Map<string, Response>();
  async match(url: string) {
    return this.store.get(url);
  }
  async put(url: string, res: Response) {
    this.store.set(url, res);
  }
}
class FakeCaches {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
}

const MODELS = {
  models: [
    { file: 'a.onnx', bytes: 100 },
    { file: 'b.onnx', bytes: 300 },
  ],
};
const ORT = { glue: 'ort.mjs', parts: ['w.part0', 'w.part1'], bytes: 600 };
function fakeFetch() {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u === '/models/manifest.json') return Response.json(MODELS);
    if (u === '/ort/manifest.json') return Response.json(ORT);
    return new Response(u);
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('model cache', () => {
  it('lists manifests, models, glue and wasm parts', async () => {
    const files = await listModelFiles(fakeFetch());
    expect(files.map((f) => f.url)).toEqual([
      '/models/manifest.json',
      '/ort/manifest.json',
      '/models/a.onnx',
      '/models/b.onnx',
      '/ort/ort.mjs',
      '/ort/w.part0',
      '/ort/w.part1',
    ]);
  });

  it('caches every file once with byte progress, then skips cached files', async () => {
    const caches = new FakeCaches();
    const f = fakeFetch();
    const progress: number[] = [];
    const deps = { caches: caches as unknown as CacheStorage, fetch: f, name: 'terces-models-v1-ort1' };
    expect(await warmModelCache((l, t) => progress.push(l / t), deps)).toBe(true);
    expect((await caches.open('terces-models-v1-ort1')).store.size).toBe(7);
    expect(progress.at(-1)).toBe(1);
    const before = f.mock.calls.length;
    await warmModelCache(undefined, deps);
    expect(f.mock.calls.length - before).toBe(2); // only the two manifests to list files
  });

  it('drops caches from older versions only', async () => {
    const caches = new FakeCaches();
    await caches.open('terces-models-v0-ort1');
    await caches.open('workbox-precache-v2');
    await caches.open('terces-models-v1-ort1');
    expect(
      await dropOldCaches({ caches: caches as unknown as CacheStorage, name: 'terces-models-v1-ort1' }),
    ).toEqual(['terces-models-v0-ort1']);
    expect(await caches.keys()).toEqual(['workbox-precache-v2', 'terces-models-v1-ort1']);
  });

  it('never throws and reports failure', async () => {
    const bad = vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    expect(
      await warmModelCache(undefined, {
        caches: new FakeCaches() as unknown as CacheStorage,
        fetch: bad,
        name: 'n',
      }),
    ).toBe(false);
    expect(
      await warmModelCache(undefined, {
        caches: undefined as unknown as CacheStorage,
        fetch: bad,
        name: 'n',
      }),
    ).toBe(false);
  });
});

it('waits for the app to be idle before each file', async () => {
  const caches = new FakeCaches();
  const f = fakeFetch();
  let release!: () => void;
  let calls = 0;
  const idle = () => (++calls === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve());
  const done = warmModelCache(
    undefined,
    { caches: caches as unknown as CacheStorage, fetch: f, name: 'n' },
    idle,
  );
  await new Promise((r) => setTimeout(r, 10));
  expect((await caches.open('n')).store.size).toBe(0);
  release();
  expect(await done).toBe(true);
  expect(calls).toBe(7);
});
