// Download budget: sums the brotli-compressed size of everything a first visit can fetch
// (dist/, which already contains the models and the ONNX Runtime files), and fails above 21 MB.
// Text readers for other alphabets (models/readers/) are fetched only when a photo has text, so
// they are reported on their own line, outside the budget.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

export const BUDGET_BYTES = 21 * 1024 * 1024;
const SKIP = [
  /^lab\.html$/,
  /^assets\/lab-/,
  /^admin\//,
  /^assets\/admin-/,
  /^_headers$/,
  /^_routes\.json$/,
  /^models\/LICENSES\//,
];
/** Downloaded on demand, outside the first-visit budget. */
export const ON_DEMAND = /^models\/readers\//;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

export function group(path: string): string {
  if (path.startsWith('models/')) return 'models';
  if (path.startsWith('ort/')) return 'onnx runtime';
  if (path.startsWith('geo/')) return 'offline map data';
  if (/\.(js|mjs)$/.test(path)) return 'javascript';
  if (path.endsWith('.css')) return 'css';
  return 'other';
}

export function measure(root = 'dist') {
  const groups = new Map<string, { raw: number; br: number; files: number }>();
  let onDemand = 0;
  for (const file of walk(root)) {
    const rel = relative(root, file).split('\\').join('/');
    if (SKIP.some((re) => re.test(rel))) continue;
    const buf = readFileSync(file);
    if (ON_DEMAND.test(rel)) {
      onDemand += brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).byteLength;
      continue;
    }
    // Already-compressed binaries barely shrink; quality 5 keeps this fast on 30 MB of WASM.
    const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).byteLength;
    const g = groups.get(group(rel)) ?? { raw: 0, br: 0, files: 0 };
    g.raw += buf.byteLength;
    g.br += br;
    g.files++;
    groups.set(group(rel), g);
  }
  const total = [...groups.values()].reduce((a, g) => a + g.br, 0);
  return { groups, total, onDemand };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { groups, total, onDemand } = measure(process.argv[2] ?? 'dist');
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  for (const [name, g] of [...groups].sort((a, b) => b[1].br - a[1].br))
    console.log(`${name.padEnd(18)} ${mb(g.br).padStart(10)} brotli  (${mb(g.raw)} raw, ${g.files} files)`);
  console.log(`${'total'.padEnd(18)} ${mb(total).padStart(10)} brotli  (budget ${mb(BUDGET_BYTES)})`);
  console.log(
    `${'on demand'.padEnd(18)} ${mb(onDemand).padStart(10)} brotli  (text readers for other alphabets)`,
  );
  if (total > BUDGET_BYTES) {
    console.error('Over budget.');
    process.exit(1);
  }
}
