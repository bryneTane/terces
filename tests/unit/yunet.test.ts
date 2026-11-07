// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { detectFaces, yunetDecode, yunetRegions } from '../../src/worker/models/yunet.ts';
import { iou, nms, tiles } from '../../src/worker/models/common.ts';
import { imageSource, runner } from './model-helpers.ts';

describe('YuNet helpers', () => {
  it('scans only the whole image when small, adds tiles when large', () => {
    expect(yunetRegions(1000, 800)).toHaveLength(1);
    expect(yunetRegions(4000, 3000).length).toBeGreaterThan(1);
  });

  it('decodes a single synthetic anchor', () => {
    const make = (n: number, k: number) => ({ data: new Float32Array(n * k), dims: [1, n, k] });
    const out = {
      cls_8: make(6400, 1),
      obj_8: make(6400, 1),
      bbox_8: make(6400, 4),
      cls_16: make(1600, 1),
      obj_16: make(1600, 1),
      bbox_16: make(1600, 4),
      cls_32: make(400, 1),
      obj_32: make(400, 1),
      bbox_32: make(400, 4),
    };
    // anchor at row 2, col 3 of stride 32 (cols = 20): index 43
    out.cls_32.data[43] = 0.9;
    out.obj_32.data[43] = 0.9;
    out.bbox_32.data.set([0.5, 0.5, Math.log(2), Math.log(2)], 43 * 4);
    const [b] = yunetDecode(out, { x: 0, y: 0, w: 1280, h: 1280 }, 0.5);
    expect(b!.score).toBeCloseTo(0.9, 5);
    // centre (3.5*32, 2.5*32) = (112, 80), size 64 at model scale; source scale x2
    expect(b!.x).toBeCloseTo(160, 3);
    expect(b!.y).toBeCloseTo(96, 3);
    expect(b!.w).toBeCloseTo(128, 3);
    expect(b!.h).toBeCloseTo(128, 3);
  });
});

describe('tiles / nms', () => {
  it('covers the image with overlap', () => {
    const t = tiles(2000, 1000, 960, 160);
    expect(Math.max(...t.map((r) => r.x + r.w))).toBe(2000);
    expect(Math.max(...t.map((r) => r.y + r.h))).toBe(1000);
  });

  it('suppresses overlapping boxes', () => {
    const kept = nms(
      [
        { x: 0, y: 0, w: 10, h: 10, score: 0.9 },
        { x: 1, y: 1, w: 10, h: 10, score: 0.8 },
        { x: 50, y: 50, w: 10, h: 10, score: 0.7 },
      ],
      0.3,
    );
    expect(kept.map((k) => k.score)).toEqual([0.9, 0.7]);
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(1);
  });
});

describe('YuNet on real photos (onnxruntime-node)', () => {
  it('finds the three faces of the Apollo 11 crew', async () => {
    const faces = await detectFaces(
      await imageSource('tests/fixtures/group-faces.jpg'),
      await runner('yunet.onnx'),
    );
    expect(faces.length).toBe(3);
    for (const f of faces) {
      expect(f.w).toBeGreaterThan(60);
      expect(f.y).toBeLessThan(700); // heads are in the upper part
    }
  }, 30_000);

  it('finds no faces in a page of text', async () => {
    const faces = await detectFaces(
      await imageSource('tests/fixtures/dense-text.jpg'),
      await runner('yunet.onnx'),
    );
    expect(faces).toHaveLength(0);
  }, 30_000);
});
