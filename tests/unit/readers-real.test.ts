// @vitest-environment node
// Real models (onnxruntime-node) on text rendered in several alphabets, through the scan stages.
// Needs system fonts for each script (macOS has them); a script without a font is skipped.
import { createCanvas, GlobalFonts, type Canvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createStages, runScan } from '../../src/worker/scan.ts';
import type { ImageSource, Runner } from '../../src/worker/models/common.ts';
import manifest from '../../models/manifest.json';
import { runner } from './model-helpers.ts';

const WORDS: [text: string, fonts: string[]][] = [
  ['禁止吸烟', ['PingFang SC', 'Heiti SC', 'Hiragino Sans GB', 'Noto Sans CJK SC']],
  ['ラーメン', ['Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP']],
  ['편의점', ['Apple SD Gothic Neo', 'Noto Sans CJK KR']],
  ['Продукты', ['Helvetica Neue', 'Arial', 'DejaVu Sans']],
  ['صيدلية', ['Geeza Pro', 'Noto Sans Arabic', 'DejaVu Sans']],
  ['ตลาด', ['Thonburi', 'Noto Sans Thai']],
  ['Bäckerei 75008', ['Helvetica Neue', 'Arial', 'DejaVu Sans']],
];

const installed = new Set(GlobalFonts.families.map((f) => f.family));

/** A sign with `text`; tilted and mirrored ones are drawn centred on a larger card. */
function sign(text: string, font: string, { tilt = 0, mirror = false } = {}): ImageSource {
  const plain = !tilt && !mirror;
  const [W, H] = plain ? [640, 160] : [800, 500];
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#111';
  ctx.font = `64px "${font}"`;
  if (plain) ctx.fillText(text, 40, 105);
  else {
    ctx.translate(W / 2, H / 2);
    ctx.rotate((tilt * Math.PI) / 180);
    if (mirror) ctx.scale(-1, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
  }

  const read = (draw: (o: Canvas) => void, dw: number, dh: number) => {
    const out = createCanvas(dw, dh);
    draw(out);
    return {
      data: out.getContext('2d').getImageData(0, 0, dw, dh).data as unknown as Uint8ClampedArray,
      width: dw,
      height: dh,
    };
  };
  return {
    width: W,
    height: H,
    pixels: (sx, sy, sw, sh, dw, dh) =>
      read((o) => o.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, dw, dh), dw, dh),
    rotated: (t, dw, dh) =>
      read(
        (o) => {
          const g = o.getContext('2d');
          g.setTransform(dw / t.len, 0, 0, dh / t.thick, dw / 2, dh / 2);
          g.rotate(-t.angle);
          g.translate(-t.cx, -t.cy);
          g.drawImage(c, 0, 0);
        },
        dw,
        dh,
      ),
  };
}

const files = Object.fromEntries(manifest.models.map((m) => [m.name, m.file]));
const runners = new Map<string, Promise<Runner>>();
const run =
  (name: string): Runner =>
  async (feeds) => {
    if (!runners.has(name)) runners.set(name, runner(files[name]!));
    return (await runners.get(name)!)(feeds);
  };
const dict = async (name: string) =>
  JSON.parse(readFileSync(`public/models/${files[name]}`, 'utf8')) as string[];

describe('tilted and mirrored text (real models)', () => {
  const font = ['Helvetica Neue', 'Arial', 'DejaVu Sans'].find((f) => installed.has(f));
  for (const [tilt, mirror] of [
    [20, false],
    [-25, false],
    [0, true],
    [22, true],
  ] as const)
    it.skipIf(!font)(
      `reads text tilted ${tilt}°${mirror ? ', mirrored' : ''}`,
      async () => {
        const names: string[] = [];
        await runScan(
          {
            source: sign('AVENGERS', font!, { tilt, mirror }),
            runner: (m) => run(m),
            dict,
            categories: ['text'],
            emit: (f) => void (f.text && names.push(f.text)),
            cancelled: () => false,
          },
          createStages().filter((s) => s.name === 'text-det' || s.name === 'text-rec'),
        );
        expect(names.join(' ').toUpperCase()).toContain('AVENGERS');
      },
      60_000,
    );
});

describe('reading text in every alphabet (real models)', () => {
  for (const [text, fonts] of WORDS) {
    const font = fonts.find((f) => installed.has(f));
    it.skipIf(!font)(
      `reads "${text}"`,
      async () => {
        const names: string[] = [];
        await runScan(
          {
            source: sign(text, font!),
            runner: (m) => run(m),
            dict,
            categories: ['text'],
            emit: (f) => void (f.text && names.push(f.text)),
            cancelled: () => false,
          },
          createStages().filter((s) => s.name === 'text-det' || s.name === 'text-rec'),
        );
        // Words can be separate boxes (largest first); Arabic dots below the line can come out
        // as an extra tiny box after the word.
        expect(names.join(' ').startsWith(text)).toBe(true);
      },
      60_000,
    );
  }
});
