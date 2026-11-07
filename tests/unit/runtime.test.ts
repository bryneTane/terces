import { describe, expect, it, vi } from 'vitest';
import {
  ModelLoadError,
  ModelRuntime,
  loadWasmBinary,
  sha256Hex,
  threadCount,
  type OrtLike,
  type OrtSession,
} from '../../src/worker/runtime.ts';

const enc = (s: string) => new TextEncoder().encode(s);

async function fakeFiles(overrides: Record<string, Uint8Array | object> = {}) {
  const wasm = enc('WASMBYTES!');
  const model = enc('MODEL');
  const files: Record<string, Uint8Array | object> = {
    '/ort/manifest.json': {
      glue: 'g.mjs',
      bytes: wasm.byteLength,
      sha256: await sha256Hex(wasm),
      parts: ['w.part0', 'w.part1'],
    },
    '/ort/w.part0': wasm.subarray(0, 4),
    '/ort/w.part1': wasm.subarray(4),
    '/models/manifest.json': {
      models: [{ name: 'm', file: 'm.onnx', bytes: model.byteLength, sha256: await sha256Hex(model) }],
    },
    '/models/m.onnx': model,
    ...overrides,
  };
  return vi.fn(async (url: string) => {
    const f = files[url];
    if (!f) return new Response(null, { status: 404 });
    return f instanceof Uint8Array ? new Response(f.slice().buffer) : Response.json(f);
  });
}

function fakeOrt(behaviour: { createFails?: string[]; runFails?: string[] } = {}) {
  const created: string[] = [];
  const ort: OrtLike = {
    env: { wasm: {} },
    InferenceSession: {
      create: vi.fn(async (_m: Uint8Array, o: { executionProviders: string[] }) => {
        const ep = o.executionProviders[0]!;
        created.push(ep);
        if (behaviour.createFails?.includes(ep)) throw new Error(`${ep} unsupported`);
        const s: OrtSession = {
          inputNames: ['x'],
          outputNames: ['y'],
          run: vi.fn(async () => {
            if (behaviour.runFails?.includes(ep)) throw new Error(`${ep} run failed`);
            return { y: ep };
          }),
          release: vi.fn(async () => {}),
        };
        return s;
      }),
    },
  };
  return { ort, created };
}

describe('runtime', () => {
  it('reassembles and verifies the chunked WASM binary', async () => {
    const { binary, glueUrl } = await loadWasmBinary(await fakeFiles());
    expect(new TextDecoder().decode(binary)).toBe('WASMBYTES!');
    expect(glueUrl).toBe('/ort/g.mjs');
  });

  it('rejects a corrupted WASM chunk', async () => {
    await expect(loadWasmBinary(await fakeFiles({ '/ort/w.part1': enc('XXXXXX') }))).rejects.toBeInstanceOf(
      ModelLoadError,
    );
  });

  it('uses threads only when cross-origin isolated', () => {
    expect(threadCount(true, 8)).toBe(4);
    expect(threadCount(true, 2)).toBe(2);
    expect(threadCount(false, 8)).toBe(1);
  });

  it('prefers WebGPU when available', async () => {
    const { ort } = fakeOrt();
    const rt = new ModelRuntime(ort, await fakeFiles(), { isolated: true, cores: 4, hasWebGPU: true });
    expect(await rt.init('webgpu')).toEqual({ backend: 'webgpu', threads: 4 });
    expect(ort.env.wasm.numThreads).toBe(4);
    expect(await rt.run('m', 'face', {})).toEqual({ y: 'webgpu' });
  });

  it('falls back to WASM when WebGPU session creation fails', async () => {
    const { ort, created } = fakeOrt({ createFails: ['webgpu'] });
    const rt = new ModelRuntime(ort, await fakeFiles(), { isolated: false, hasWebGPU: true });
    await rt.init('webgpu');
    expect(await rt.run('m', 'face', {})).toEqual({ y: 'wasm' });
    expect(created).toEqual(['webgpu', 'wasm']);
    expect(rt.backend).toBe('wasm');
  });

  it('falls back to WASM when the first WebGPU run fails', async () => {
    const { ort } = fakeOrt({ runFails: ['webgpu'] });
    const rt = new ModelRuntime(ort, await fakeFiles(), { isolated: false, hasWebGPU: true });
    await rt.init('webgpu');
    expect(await rt.run('m', 'face', {})).toEqual({ y: 'wasm' });
    expect(rt.backend).toBe('wasm');
  });

  it('uses WASM when WebGPU is unavailable', async () => {
    const { ort } = fakeOrt();
    const rt = new ModelRuntime(ort, await fakeFiles(), { isolated: false, hasWebGPU: false });
    expect((await rt.init('webgpu')).backend).toBe('wasm');
  });

  it('raises model-load on a model checksum mismatch', async () => {
    const { ort } = fakeOrt();
    const rt = new ModelRuntime(ort, await fakeFiles({ '/models/m.onnx': enc('TAMPERED') }), {
      isolated: false,
      hasWebGPU: false,
    });
    await rt.init('wasm');
    await expect(rt.session('m', 'face')).rejects.toMatchObject({ code: 'model-load' });
  });
});
