// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dbPostprocess, detSize, detectText } from '../../src/worker/models/ppocr.ts';
import { iou } from '../../src/worker/models/common.ts';
import { findingsToZones, mergeText } from '../../src/lib/zones.ts';
import { imageSource, runner } from './model-helpers.ts';
import expected from '../fixtures/expected.json';

describe('PP-OCR detection helpers', () => {
  it('sizes the input to multiples of 32 with a 960 limit', () => {
    expect(detSize(1600, 1257)).toEqual({ w: 960, h: 768 });
    expect(detSize(100, 50)).toEqual({ w: 96, h: 64 });
  });

  it('turns one blob of probability into one unclipped box', () => {
    const W = 40,
      H = 20;
    const prob = new Float32Array(W * H);
    for (let y = 8; y < 12; y++) for (let x = 5; x < 35; x++) prob[y * W + x] = 0.9;
    const [b, ...rest] = dbPostprocess(prob, W, H, 2, 2, 80, 40);
    expect(rest).toHaveLength(0);
    expect(b!.score).toBeCloseTo(0.9, 5);
    expect(b!.w).toBeGreaterThan(60);
    expect(b!.h).toBeGreaterThan(8);
  });

  it('drops blobs thinner than 3 px and low-score blobs', () => {
    const W = 20,
      H = 20;
    const prob = new Float32Array(W * H);
    for (let x = 2; x < 18; x++) prob[5 * W + x] = 0.9; // 1 px tall
    for (let y = 10; y < 15; y++) for (let x = 2; x < 18; x++) prob[y * W + x] = 0.35; // weak
    expect(dbPostprocess(prob, W, H, 1, 1, 20, 20)).toHaveLength(0);
  });
});

describe('PP-OCR detection on real images (onnxruntime-node)', () => {
  it('finds the street sign text in street-gps.jpg', async () => {
    const boxes = await detectText(
      await imageSource('tests/fixtures/street-gps.jpg'),
      await runner('ppocrv5-det-mobile.onnx'),
    );
    const sign = expected['street-gps.jpg'].text[0]!.box;
    const best = Math.max(...boxes.map((b) => iou(b, sign)));
    expect(best).toBeGreaterThan(0.3);
  }, 30_000);

  it('finds many regions on a page of text', async () => {
    const boxes = await detectText(
      await imageSource('tests/fixtures/dense-text.jpg'),
      await runner('ppocrv5-det-mobile.onnx'),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(30);
  }, 30_000);
});

describe('dense text zones', () => {
  it('groups a page of text into fewer, line-sized zones when it is dense', async () => {
    const src = await imageSource('tests/fixtures/dense-text.jpg');
    const boxes = await detectText(src, await runner('ppocrv5-det-mobile.onnx'));
    const findings = boxes.map((b, i) => ({
      id: `t${i}`,
      category: 'text' as const,
      box: b,
      score: b.score,
      source: 'ppocr' as const,
    }));
    const merged = mergeText(findings);
    const zones = findingsToZones(findings, src.width, src.height);
    console.info(`dense-text: ${boxes.length} boxes, ${merged.length} merged, ${zones.length} zones`);
    if (merged.length > 60) expect(zones.length).toBeLessThan(merged.length);
    else expect(zones.length).toBe(merged.length);
  }, 30_000);
});
