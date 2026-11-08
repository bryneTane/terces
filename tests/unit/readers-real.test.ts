// @vitest-environment node
// Real models (onnxruntime-node) on text rendered in several alphabets, through the scan stages.
// Needs system fonts for each script (macOS has them); a script without a font is skipped.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
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

function sign(text: string, font: string): ImageSource {
  const c = createCanvas(640, 160);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(0, 0, 640, 160);
  ctx.fillStyle = '#111';
  ctx.font = `64px "${font}"`;
  ctx.fillText(text, 40, 105);

  return {
    width: 640,
    height: 160,
    pixels(sx, sy, sw, sh, dw, dh) {
      const out = createCanvas(dw, dh);
      out.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, dw, dh);
      return {
        data: out.getContext('2d').getImageData(0, 0, dw, dh).data as unknown as Uint8ClampedArray,
        width: dw,
        height: dh,
      };
    },
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
