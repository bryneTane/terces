// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ctcDecode,
  detectText,
  largest,
  recWidth,
  readTexts,
  recognizeText,
  rotate90,
} from '../../src/worker/models/ppocr.ts';
import { iou } from '../../src/worker/models/common.ts';
import { imageSource, runner } from './model-helpers.ts';
import expected from '../fixtures/expected.json';

const dict = JSON.parse(readFileSync('public/models/ppocrv5-dict-latin.json', 'utf8')) as string[];

/** Build [T, C] one-hot-ish probabilities for a class sequence. */
function logits(seq: number[], classes = dict.length + 2) {
  const p = new Float32Array(seq.length * classes);
  seq.forEach((c, t) => {
    p.fill(0.001, t * classes, (t + 1) * classes);
    p[t * classes + c] = 0.95;
  });
  return { p, steps: seq.length, classes };
}
const cls = (ch: string) => dict.indexOf(ch) + 1;

describe('CTC decode', () => {
  it('collapses repeats, drops blanks, maps the last class to a space', () => {
    const space = dict.length + 1;
    const { p, steps, classes } = logits([
      0,
      cls('1'),
      cls('1'),
      0,
      cls('1'),
      cls('2'),
      space,
      cls('R'),
      0,
      0,
    ]);
    const r = ctcDecode(p, steps, classes, dict);
    expect(r.text).toBe('112 R');
    expect(r.score).toBeCloseTo(0.95, 2);
  });

  it('returns empty text for all blanks', () => {
    const { p, steps, classes } = logits([0, 0, 0]);
    expect(ctcDecode(p, steps, classes, dict)).toEqual({ text: '', score: 0 });
  });
});

describe('recognition helpers', () => {
  it('keeps aspect at height 48, multiple of 8, capped', () => {
    expect(recWidth(100, 48)).toBe(104);
    expect(recWidth(10000, 10)).toBe(1280);
  });

  it('rotates pixels 90 degrees', () => {
    // 2x1 image: red, green -> 1x2 with green on top
    const r = rotate90({
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
      width: 2,
      height: 1,
    });
    expect([r.width, r.height]).toEqual([1, 2]);
    expect([...r.data.slice(0, 4)]).toEqual([0, 255, 0, 255]);
  });

  it('keeps the largest boxes', () => {
    const b = (s: number) => ({ x: 0, y: 0, w: s, h: s, score: 1 });
    expect(largest([b(1), b(5), b(3)], 2).map((x) => x.w)).toEqual([5, 3]);
  });
});

describe('recognition on real images (onnxruntime-node)', () => {
  it('reads the street sign verbatim', async () => {
    const src = await imageSource('tests/fixtures/street-gps.jpg');
    const boxes = await detectText(src, await runner('ppocrv5-det-mobile.onnx'));
    const sign = expected['street-gps.jpg'].text[0]!;
    const box = boxes.reduce((a, b) => (iou(b, sign.box) > iou(a, sign.box) ? b : a));
    const rec = await runner('ppocrv5-rec-latin.onnx');
    const r = await recognizeText(src, box, rec, dict);
    expect(r?.text).toBe(sign.text);
  }, 60_000);
});

describe('reading many boxes', () => {
  it('reads each box like one box at a time, in order', async () => {
    const src = await imageSource('tests/fixtures/street-gps.jpg');
    const boxes = (await detectText(src, await runner('ppocrv5-det-mobile.onnx'))).slice(0, 6);
    const rec = await runner('ppocrv5-rec-latin.onnx');
    const all = await readTexts(src, [...boxes, { x: 0, y: 0, w: 1, h: 1 }], rec, dict);
    expect(all.at(-1)).toBeNull();
    for (const [i, b] of boxes.entries()) expect(all[i]).toEqual(await recognizeText(src, b, rec, dict));
  }, 60_000);
});
