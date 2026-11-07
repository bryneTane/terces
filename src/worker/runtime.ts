// ONNX Runtime setup inside the worker: self-hosted WASM, WebGPU first, WASM fallback,
// and sha256 verification of every model against the same-origin manifest.
import type { Backend, Stage } from './protocol.ts';

export interface OrtSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, unknown>>;
  release?(): Promise<void>;
  inputNames: readonly string[];
  outputNames: readonly string[];
}

export interface OrtLike {
  env: {
    logLevel?: string;
    wasm: {
      wasmPaths?: unknown;
      wasmBinary?: ArrayBuffer | Uint8Array;
      numThreads?: number;
      proxy?: boolean;
    };
  };
  InferenceSession: {
    create(
      model: Uint8Array,
      options: { executionProviders: string[]; logSeverityLevel?: number },
    ): Promise<OrtSession>;
  };
}

export interface ModelEntry {
  name: string;
  file: string;
  bytes: number;
  sha256: string;
}

export class ModelLoadError extends Error {
  readonly code = 'model-load' as const;
}

type Fetch = (url: string) => Promise<Response>;
type Progress = (stage: Stage, loaded: number, total: number) => void;

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', view as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getBytes(fetchFn: Fetch, url: string): Promise<Uint8Array> {
  const res = await fetchFn(url);
  if (!res.ok) throw new ModelLoadError(`GET ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Fetch the chunked ORT WASM binary (see scripts/copy-ort.ts) and verify it. */
export async function loadWasmBinary(fetchFn: Fetch, base = '/ort/', onProgress?: Progress) {
  const res = await fetchFn(`${base}manifest.json`);
  if (!res.ok) throw new ModelLoadError(`GET ${base}manifest.json: ${res.status}`);
  const m = (await res.json()) as { glue: string; bytes: number; sha256: string; parts: string[] };
  const binary = new Uint8Array(m.bytes);
  let off = 0;
  for (const part of m.parts) {
    const chunk = await getBytes(fetchFn, `${base}${part}`);
    binary.set(chunk, off);
    off += chunk.byteLength;
    onProgress?.('runtime', off, m.bytes);
  }
  if (off !== m.bytes || (await sha256Hex(binary)) !== m.sha256)
    throw new ModelLoadError('runtime checksum mismatch');
  return { binary, glueUrl: `${base}${m.glue}` };
}

export function threadCount(isolated: boolean, cores: number | undefined): number {
  return isolated ? Math.max(1, Math.min(4, cores ?? 1)) : 1;
}

export class ModelRuntime {
  backend: Backend = 'wasm';
  threads = 1;
  private sessions = new Map<string, Promise<OrtSession>>();
  private manifest: ModelEntry[] = [];

  constructor(
    private ort: OrtLike,
    private fetchFn: Fetch,
    private env: { isolated: boolean; cores?: number; hasWebGPU: boolean },
    private onProgress: Progress = () => {},
  ) {}

  async init(prefer: Backend): Promise<{ backend: Backend; threads: number }> {
    const { binary, glueUrl } = await loadWasmBinary(this.fetchFn, '/ort/', this.onProgress);
    this.threads = threadCount(this.env.isolated, this.env.cores);
    this.ort.env.wasm.wasmBinary = binary;
    this.ort.env.wasm.wasmPaths = { mjs: glueUrl };
    this.ort.env.wasm.numThreads = this.threads;
    this.ort.env.wasm.proxy = false;
    this.ort.env.logLevel = 'error';
    this.backend = prefer === 'webgpu' && this.env.hasWebGPU ? 'webgpu' : 'wasm';
    const res = await this.fetchFn('/models/manifest.json');
    if (!res.ok) throw new ModelLoadError('model manifest missing');
    this.manifest = ((await res.json()) as { models: ModelEntry[] }).models;
    return { backend: this.backend, threads: this.threads };
  }

  /** Raw, verified bytes of a manifest file (models and dictionaries). */
  async file(name: string, stage: Stage): Promise<Uint8Array> {
    const entry = this.manifest.find((m) => m.name === name);
    if (!entry) throw new ModelLoadError(`unknown model ${name}`);
    const bytes = await getBytes(this.fetchFn, `/models/${entry.file}`);
    this.onProgress(stage, bytes.byteLength, entry.bytes || bytes.byteLength);
    if ((await sha256Hex(bytes)) !== entry.sha256) throw new ModelLoadError(`${name}: checksum mismatch`);
    return bytes;
  }

  session(name: string, stage: Stage): Promise<OrtSession> {
    let s = this.sessions.get(name);
    if (!s) {
      s = this.create(name, stage);
      this.sessions.set(name, s);
      s.catch(() => this.sessions.delete(name));
    }
    return s;
  }

  /** Run a model. A WebGPU failure switches the whole runtime to WASM and retries once. */
  async run(name: string, stage: Stage, feeds: Record<string, unknown>): Promise<Record<string, unknown>> {
    const session = await this.session(name, stage);
    try {
      return await session.run(feeds);
    } catch (e) {
      if (this.backend !== 'webgpu') throw e;
      this.fallbackToWasm();
      return (await this.session(name, stage)).run(feeds);
    }
  }

  private async create(name: string, stage: Stage): Promise<OrtSession> {
    const bytes = await this.file(name, stage);
    try {
      return await this.ort.InferenceSession.create(bytes, {
        executionProviders: [this.backend],
        logSeverityLevel: 3,
      });
    } catch (e) {
      if (this.backend !== 'webgpu') throw new ModelLoadError(`${name}: ${(e as Error).message}`);
      this.fallbackToWasm(name);
      return this.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], logSeverityLevel: 3 });
    }
  }

  /** Switch to WASM and release WebGPU sessions (not awaited: one may be the session being created). */
  private fallbackToWasm(keep?: string) {
    this.backend = 'wasm';
    for (const [name, p] of this.sessions) {
      if (name === keep) continue;
      this.sessions.delete(name);
      p.then((s) => s.release?.()).catch(() => {});
    }
  }
}
