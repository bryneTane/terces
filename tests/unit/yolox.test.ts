// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { YOLOX_SIZE, detectObjects, yoloxDecode } from '../../src/worker/models/yolox.ts';
import { imageSource, runner } from './model-helpers.ts';

const ANCHORS = (YOLOX_SIZE / 8) ** 2 + (YOLOX_SIZE / 16) ** 2 + (YOLOX_SIZE / 32) ** 2;

describe('YOLOX decode', () => {
  it('has 3549 anchors', () => expect(ANCHORS).toBe(3549));

  it('decodes one synthetic anchor with grid math, keeps only wanted classes', () => {
    const data = new Float32Array(ANCHORS * 85);
    // stride 16 grid starts after 52*52 = 2704 anchors; cols = 26; row 3, col 5
    const i = 2704 + 3 * 26 + 5;
    data.set([0.5, 0.5, Math.log(4), Math.log(2), 0.9], i * 85);
    data[i * 85 + 5 + 2] = 0.8; // car
    data[i * 85 + 5 + 16] = 0.99; // dog: ignored
    const [d, ...rest] = yoloxDecode({ data, dims: [1, ANCHORS, 85] }, 0.5, 2000, 2000);
    expect(rest).toHaveLength(0);
    expect(d!.label).toBe('car');
    expect(d!.category).toBe('vehicle');
    expect(d!.score).toBeCloseTo(0.72, 5);
    // centre (5.5*16, 3.5*16) = (88, 56), size 64x32 at model scale; source scale x2
    expect(d!.box.x).toBeCloseTo(112, 3);
    expect(d!.box.y).toBeCloseTo(80, 3);
    expect(d!.box.w).toBeCloseTo(128, 3);
    expect(d!.box.h).toBeCloseTo(64, 3);
  });

  it('drops scores below 0.45', () => {
    const data = new Float32Array(ANCHORS * 85);
    data[4] = 0.6;
    data[5] = 0.7; // 0.42
    expect(yoloxDecode({ data, dims: [1, ANCHORS, 85] }, 1, 416, 416)).toEqual([]);
  });
});

describe('YOLOX-Nano on fixtures (real model)', () => {
  it('finds a vehicle in plate.jpg', async () => {
    const found = await detectObjects(
      await imageSource('tests/fixtures/plate.jpg'),
      await runner('yolox-nano.onnx'),
    );
    expect(found.some((f) => f.category === 'vehicle')).toBe(true);
  });

  it('finds people in group-faces.jpg', async () => {
    const found = await detectObjects(
      await imageSource('tests/fixtures/group-faces.jpg'),
      await runner('yolox-nano.onnx'),
    );
    expect(found.filter((f) => f.category === 'person').length).toBeGreaterThanOrEqual(2);
  });
});
