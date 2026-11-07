// Copies the onnxruntime-web WebGPU+CPU (JSEP) build into public/ort/, splitting the WASM binary
// into chunks under Cloudflare's per-file limit. The worker reassembles it (env.wasm.wasmBinary).
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './ort-chunks.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkgPath = join(root, 'node_modules/onnxruntime-web/package.json');
const dist = join(root, 'node_modules/onnxruntime-web/dist');
const version = (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }).version;
const out = join(root, 'public/ort');

const GLUE = 'ort-wasm-simd-threaded.jsep.mjs';
const WASM = 'ort-wasm-simd-threaded.jsep.wasm';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(join(dist, GLUE), join(out, GLUE));
const { manifest, parts } = buildManifest(
  version,
  GLUE,
  WASM,
  new Uint8Array(readFileSync(join(dist, WASM))),
);
parts.forEach((p, i) => writeFileSync(join(out, manifest.parts[i]!), p));
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`ort ${version}: ${GLUE} + ${parts.length} wasm parts (${(manifest.bytes / 1e6).toFixed(1)} MB)`);
