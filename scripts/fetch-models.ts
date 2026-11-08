import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenseFileName, prepare, verifyOrPin, type Manifest } from './model-manifest.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifestPath = join(root, 'models/manifest.json');
const outDir = join(root, 'public/models');
const licenseDir = join(outDir, 'LICENSES');
mkdirSync(licenseDir, { recursive: true });

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
let pinnedAny = false;

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

for (const [i, entry] of manifest.models.entries()) {
  const target = join(outDir, entry.file);
  const cached: Uint8Array | null = existsSync(target) ? new Uint8Array(readFileSync(target)) : null;
  // The served file is checked against its own pin; a download goes through `prepare`, which
  // also checks the source pin and converts it (8-bit weights, dictionaries).
  let result = cached && entry.sha256 ? verifyOrPin(entry, cached) : null;
  if (!result?.ok) {
    process.stdout.write(`downloading ${entry.name}... `);
    const prepared = prepare(entry, await download(entry.url));
    if (!prepared.ok) {
      console.error(`\n${prepared.reason}`);
      process.exit(1);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, prepared.bytes);
    console.log(
      `${(prepared.bytes.byteLength / 1e6).toFixed(2)} MB${entry.convert ? ` (${entry.convert})` : ''}`,
    );
    result = prepared;
  } else {
    console.log(`${entry.name}: cached, verified`);
  }
  if (result.pinned) {
    manifest.models[i] = result.entry;
    pinnedAny = true;
    console.log(`  pinned sha256 ${result.entry.sha256}`);
  }
  const licenseFile = join(licenseDir, licenseFileName(entry.licenseUrl));
  if (!existsSync(licenseFile)) writeFileSync(licenseFile, await download(entry.licenseUrl));
}

if (pinnedAny) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('models ready in public/models');
