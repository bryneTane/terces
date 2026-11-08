// Detection quality on labelled photos: `pnpm build && pnpm eval`.
// Runs the real app (production build, Chromium) on every photo of tests/eval/set.json, plus the
// git-ignored tests/eval/local.json when present (photos that cannot be shared) and the
// multi-script photos of `pnpm eval:synth`, and reports how much labelled text, faces and plates
// end up covered, how many zones cover nothing real, and how many words are read right.
// Options: --only=<id part>  --out=<file.json> (default tests/eval/.cache/last.json)
//          --compare=<file.json> (show the change against an earlier run)
import { chromium, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preview } from 'vite';
import {
  readRight,
  scoreImage,
  totals,
  type Box,
  type EvalImage,
  type Family,
  type Predicted,
} from './eval-score.ts';

const CACHE = 'tests/eval/.cache';
const UA = 'TercesEval/1.0 (detection quality check)';
const FAMILIES: Family[] = ['text', 'face'];

export interface SetImage extends EvalImage {
  url?: string;
  /** Local file, for photos that cannot be downloaded or shared. */
  path?: string;
  /** Alphabet of each labelled box (multi-script photos from `pnpm eval:synth`). */
  scripts?: string[];
}

/** Raw detections as the worker sent them, as fractions of the image. */
export interface RawFinding {
  id: string;
  category: string;
  box: { x: number; y: number; w: number; h: number };
  score: number;
  text?: string;
}

export interface ImageRun {
  id: string;
  zones: Predicted[];
  findings: RawFinding[];
  ms: Record<string, number>;
}

async function fileFor(img: SetImage): Promise<string> {
  if (img.path) return img.path.replace(/^~/, process.env.HOME ?? '~');
  const file = join(CACHE, 'images', `${img.id}.jpg`);
  if (!existsSync(file)) {
    const res = await fetch(img.url!, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${img.id}: GET ${img.url} ${res.status}`);
    mkdirSync(join(CACHE, 'images'), { recursive: true });
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  }
  return file;
}

/**
 * Page code, as plain strings: tsx adds helpers to compiled functions that do not exist in the
 * page. CAPTURE records the worker's messages (findings, the scanned bitmap size, stage timings).
 */
const CAPTURE = `(() => {
  const e = (window.__eval = { findings: new Map(), size: [1, 1], ms: {} });
  const Base = window.Worker;
  window.Worker = class extends Base {
    constructor(url, opts) {
      super(url, opts);
      this.addEventListener('message', (ev) => {
        const m = ev.data;
        if (m && m.type === 'finding') e.findings.set(m.finding.id, m.finding);
        if (m && m.type === 'done') e.ms = m.ms;
      });
    }
    postMessage(msg, transfer) {
      if (msg && msg.type === 'scan' && msg.bitmap) e.size = [msg.bitmap.width, msg.bitmap.height];
      super.postMessage(msg, transfer);
    }
  };
})()`;
const READ_CAPTURE = `({ findings: [...window.__eval.findings.values()], size: window.__eval.size, ms: window.__eval.ms })`;
const READ_ZONES = `[...document.querySelectorAll('[data-testid="zone"]')].map((el) => ({
  cat: el.dataset.category,
  x: parseFloat(el.style.left) / 100,
  y: parseFloat(el.style.top) / 100,
  w: parseFloat(el.style.width) / 100,
  h: parseFloat(el.style.height) / 100,
}))`;

async function runOne(page: Page, base: string, img: SetImage): Promise<ImageRun> {
  await page.goto(base);
  await page.getByTestId('file-input').setInputFiles(await fileFor(img));
  const go = page.getByRole('button', { name: 'Cloak this photo' });
  await go.waitFor({ timeout: 240_000 });
  const raw = (await page.evaluate(READ_CAPTURE)) as {
    findings: RawFinding[];
    size: [number, number];
    ms: Record<string, number>;
  };
  await go.click();
  await page.getByTestId('zone-layer').waitFor();
  const zones = (await page.evaluate(READ_ZONES)) as Predicted[];
  const [W, H] = raw.size;
  const findings = raw.findings.map((f) => ({
    ...f,
    box: { x: f.box.x / W, y: f.box.y / H, w: f.box.w / W, h: f.box.h / H },
  }));
  return { id: img.id, zones, findings, ms: raw.ms };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function report(images: SetImage[], runs: ImageRun[], compare?: ImageRun[]): string {
  const lines: string[] = [];
  const scores = runs.map((r) =>
    scoreImage(
      images.find((i) => i.id === r.id)!,
      r.zones,
    ),
  );
  const before = compare?.map((r) => {
    const img = images.find((i) => i.id === r.id);
    return img ? scoreImage(img, r.zones) : {};
  });
  for (const fam of FAMILIES) {
    const t = totals(scores, fam);
    if (!t.images) continue;
    const b = before ? totals(before, fam) : null;
    const was = (v?: number) => (v === undefined ? '' : ` (was ${pct(v)})`);
    lines.push(
      `${fam.padEnd(5)} ${t.images} photos, ${t.labelled} labelled: covered ${pct(t.recall)}${was(b?.recall)}, ` +
        `${t.zones} zones, ${t.falseZones} false (${t.falsePerImage.toFixed(2)} per photo${b ? `, was ${b.falsePerImage.toFixed(2)}` : ''})`,
    );
  }
  const avg = (rs: ImageRun[]) => {
    const keys = [...new Set(rs.flatMap((r) => Object.keys(r.ms)))];
    return keys
      .map((k) => `${k} ${Math.round(rs.reduce((a, r) => a + (r.ms[k] ?? 0), 0) / rs.length)} ms`)
      .join(', ');
  };
  lines.push(...readingReport(images, runs, compare));
  lines.push(`time  average per photo: ${avg(runs)}${compare ? ` (was ${avg(compare)})` : ''}`);
  lines.push('', 'Per photo (misses = labelled but not covered, false = zone over nothing labelled):');
  runs.forEach((r, i) => {
    const s = scores[i]!;
    const parts = FAMILIES.filter((f) => s[f]).map((f) => {
      const x = s[f]!;
      const miss = x.misses
        .map((m) => m.text ?? m.cat)
        .slice(0, 6)
        .join(', ');
      return `${f} ${x.covered}/${x.labelled}${x.falseZones ? ` +${x.falseZones} false` : ''}${miss ? ` [missed: ${miss}]` : ''}`;
    });
    lines.push(`  ${r.id.padEnd(26)} ${parts.join('  ')}`);
  });
  return lines.join('\n');
}

const overlap = (a: Box, b: Box) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / (a.w * a.h + b.w * b.h - w * h);
};

/** Words read right on photos whose labels name their alphabet: the text found over each word. */
function readingScore(images: SetImage[], runs: ImageRun[]) {
  const by = new Map<string, [number, number]>();
  for (const r of runs) {
    const img = images.find((i) => i.id === r.id);
    if (!img?.scripts) continue;
    const texts = r.findings.filter((f) => f.category === 'text' || f.category === 'plate');
    img.boxes.forEach((b, i) => {
      const best = texts.reduce<RawFinding | null>(
        (a, f) => (overlap(f.box, b) > (a ? overlap(a.box, b) : 0) ? f : a),
        null,
      );
      const key = img.scripts![i]!;
      const [n, ok] = by.get(key) ?? [0, 0];
      by.set(key, [n + 1, ok + (readRight(best?.text, b.text ?? '') ? 1 : 0)]);
    });
  }
  return by;
}

function readingReport(images: SetImage[], runs: ImageRun[], compare?: ImageRun[]): string[] {
  const now = readingScore(images, runs);
  if (!now.size) return [];
  const sum = (m: Map<string, [number, number]>) =>
    [...m.values()].reduce(([a, b], [n, k]) => [a + n, b + k], [0, 0]);
  const [n, ok] = sum(now);
  const before = compare ? sum(readingScore(images, compare)) : null;
  const per = [...now].map(([k, [m, r]]) => `${k} ${r}/${m}`).join(', ');
  return [
    `read  ${ok}/${n} words read right${before && before[0] ? ` (was ${before[1]}/${before[0]})` : ''}: ${per}`,
  ];
}

async function main() {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const sets = ['tests/eval/set.json', 'tests/eval/local.json', join(CACHE, 'synth.json')].filter(existsSync);
  let images: SetImage[] = sets.flatMap(
    (f) => (JSON.parse(readFileSync(f, 'utf8')) as { images: SetImage[] }).images,
  );
  const only = arg('only');
  if (only) images = images.filter((i) => i.id.includes(only));
  if (!existsSync('dist/index.html')) throw new Error('No build: run `pnpm build` first.');

  const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'warn' });
  const base = 'http://localhost:4179/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1400, height: 1000 } });
  await ctx.addInitScript({ content: CAPTURE });
  const runs: ImageRun[] = [];
  try {
    for (const [n, img] of images.entries()) {
      process.stdout.write(`\r${n + 1}/${images.length} ${img.id.padEnd(30)}`);
      const page = await ctx.newPage();
      try {
        runs.push(await runOne(page, base, img));
      } catch (e) {
        console.error(`\n${img.id}: ${(e as Error).message.split('\n')[0]}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
  process.stdout.write('\n');
  const out = arg('out') ?? join(CACHE, 'last.json');
  mkdirSync(join(out, '..'), { recursive: true });
  writeFileSync(out, JSON.stringify(runs));
  const cmp = arg('compare');
  console.log(report(images, runs, cmp ? (JSON.parse(readFileSync(cmp, 'utf8')) as ImageRun[]) : undefined));
  console.log(`\nRaw results: ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
