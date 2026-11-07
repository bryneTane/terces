// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  MASK_COLOR,
  blur,
  mosaic,
  coverage,
  readsPixels,
  renderCloak,
  shapeOf,
  stylesFor,
  type Ctx2D,
} from '../../src/lib/mask.ts';
import type { Zone } from '../../src/lib/types.ts';

function source() {
  const c = createCanvas(100, 80);
  const ctx = c.getContext('2d');
  for (let x = 0; x < 100; x++) {
    ctx.fillStyle = `rgb(${x * 2}, 200, ${255 - x * 2})`;
    ctx.fillRect(x, 0, 1, 80);
  }
  return c;
}

const zone = (
  x: number,
  y: number,
  w: number,
  h: number,
  selected = true,
  category: Zone['category'] = 'text',
): Zone => ({
  id: `z${x}`,
  kind: 'detected',
  category,
  rect: { x, y, w, h },
  selected,
});

describe('renderCloak', () => {
  it('fills selected zones with the opaque mask and leaves the rest untouched', () => {
    const src = source();
    const out = createCanvas(100, 80);
    const ctx = out.getContext('2d');
    renderCloak(
      ctx as unknown as Ctx2D,
      src as unknown as CanvasImageSource,
      100,
      80,
      [zone(10, 10, 20, 20), zone(60, 10, 20, 20, false)],
      'opaque',
    );
    const px = ctx.getImageData(0, 0, 100, 80).data;
    const at = (x: number, y: number) => [
      px[(y * 100 + x) * 4],
      px[(y * 100 + x) * 4 + 1],
      px[(y * 100 + x) * 4 + 2],
    ];
    const mask = [0x0b, 0x0d, 0x10];
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) expect(at(x, y)).toEqual(mask);
    expect(at(70, 20)).toEqual([140, 200, 115]); // deselected zone keeps the original pixel
    expect(at(5, 5)).toEqual([10, 200, 245]);
    expect(MASK_COLOR).toBe('#0b0d10');
  });

  it('covers fractional zone edges fully', () => {
    const out = createCanvas(50, 50);
    const ctx = out.getContext('2d');
    renderCloak(
      ctx as unknown as Ctx2D,
      source() as unknown as CanvasImageSource,
      50,
      50,
      [zone(10.6, 10.6, 5.2, 5.2)],
      'opaque',
    );
    const px = ctx.getImageData(10, 10, 6, 6).data;
    for (let i = 0; i < px.length; i += 4) expect([px[i], px[i + 1], px[i + 2]]).toEqual([0x0b, 0x0d, 0x10]);
  });
});

describe('mosaic style', () => {
  const at = (px: Uint8ClampedArray, w: number, x: number, y: number): [number, number, number] => [
    px[(y * w + x) * 4]!,
    px[(y * w + x) * 4 + 1]!,
    px[(y * w + x) * 4 + 2]!,
  ];

  it('replaces the zone with noisy block means that differ from the source', () => {
    const src = source();
    const out = createCanvas(100, 80);
    const ctx = out.getContext('2d');
    renderCloak(
      ctx as unknown as Ctx2D,
      src as unknown as CanvasImageSource,
      100,
      80,
      [zone(0, 0, 40, 40)],
      'mosaic',
    );
    const before = src.getContext('2d').getImageData(0, 0, 100, 80).data as unknown as Uint8ClampedArray;
    const after = ctx.getImageData(0, 0, 100, 80).data as unknown as Uint8ClampedArray;
    let same = 0;
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) if (at(before, 100, x, y).join() === at(after, 100, x, y).join()) same++;
    expect(same).toBeLessThan(40 * 40 * 0.05);
    // Within a block, the red channel stays near the block mean (source gradient spans 0..38).
    expect(Math.abs(at(after, 100, 0, 0)[0] - at(after, 100, 19, 0)[0])).toBeLessThanOrEqual(2 * 24 + 1);
    expect(at(after, 100, 70, 20)).toEqual(at(before, 100, 70, 20));
  });

  it('applies the style chosen for each category, text and plates included', () => {
    const out = createCanvas(100, 80);
    const ctx = out.getContext('2d');
    const src = source();
    renderCloak(
      ctx as unknown as Ctx2D,
      src as unknown as CanvasImageSource,
      100,
      80,
      [
        { ...zone(0, 0, 40, 40), category: 'text' },
        { ...zone(50, 10, 30, 20), id: 'p', category: 'plate' },
      ],
      { text: 'mosaic', plate: 'opaque' },
    );
    const before = src.getContext('2d').getImageData(0, 0, 100, 80).data as unknown as Uint8ClampedArray;
    const px = ctx.getImageData(0, 0, 100, 80).data as unknown as Uint8ClampedArray;
    expect(at(px, 100, 20, 20)).not.toEqual([0x0b, 0x0d, 0x10]); // text got the mosaic
    expect(at(px, 100, 20, 20)).not.toEqual(at(before, 100, 20, 20));
    expect(at(px, 100, 60, 20)).toEqual([0x0b, 0x0d, 0x10]); // plate got the solid mask
  });

  it('mosaic() averages a block and bounds the noise', () => {
    const d = new Uint8ClampedArray(20 * 20 * 4).map((_, i) => (i % 4 === 3 ? 255 : i % 4 === 0 ? 100 : 0));
    mosaic(d, 20, 20, () => 1); // max positive noise
    expect([d[0], d[1], d[2], d[3]]).toEqual([124, 24, 24, 255]);
  });
});

describe('blur style', () => {
  /** Mean absolute difference between horizontal neighbours: high for detail, low once blurred. */
  const detail = (d: Uint8ClampedArray, w: number, h: number) => {
    let sum = 0;
    for (let y = 0; y < h; y++)
      for (let x = 1; x < w; x++) sum += Math.abs(d[(y * w + x) * 4]! - d[(y * w + x - 1) * 4]!);
    return sum / (h * (w - 1));
  };

  it('destroys fine detail like stripes of text', () => {
    const w = 120,
      h = 60;
    // Black and white 2 px stripes: the worst case for a light blur.
    const d = new Uint8ClampedArray(w * h * 4).map((_, i) =>
      i % 4 === 3 ? 255 : Math.floor(i / 4 / 2) % 2 ? 255 : 0,
    );
    expect(detail(d, w, h)).toBeGreaterThan(100);
    blur(d, w, h, () => 0.5); // no noise
    expect(detail(d, w, h)).toBeLessThan(3);
    expect(d[3]).toBe(255);
  });

  it('is the default style and reads pixels back', () => {
    const out = createCanvas(100, 80);
    const ctx = out.getContext('2d');
    const src = source();
    renderCloak(ctx as unknown as Ctx2D, src as unknown as CanvasImageSource, 100, 80, [zone(0, 0, 60, 60)]);
    const px = ctx.getImageData(0, 0, 100, 80).data as unknown as Uint8ClampedArray;
    expect(px[(30 * 100 + 30) * 4]).not.toBe(0x0b);
    expect(readsPixels({})).toBe(true);
    expect(readsPixels('opaque')).toBe(false);
    expect(
      readsPixels({ face: 'opaque', text: 'opaque', plate: 'opaque', person: 'opaque', manual: 'opaque' }),
    ).toBe(false);
  });

  it('offers emoji for faces only, and falls back to blur elsewhere', () => {
    expect(stylesFor('face')).toContain('emoji');
    expect(stylesFor('text')).not.toContain('emoji');
    const out = createCanvas(100, 80);
    const ctx = out.getContext('2d');
    renderCloak(
      ctx as unknown as Ctx2D,
      source() as unknown as CanvasImageSource,
      100,
      80,
      [zone(0, 0, 40, 40), { ...zone(50, 10, 40, 40), id: 't', category: 'text' }],
      { face: 'emoji', text: 'emoji' },
    );
    const before = source().getContext('2d').getImageData(0, 0, 100, 80).data;
    const px = ctx.getImageData(0, 0, 100, 80).data;
    // Both zones were rewritten (the emoji sits on a blurred face).
    const changed = (x0: number, y0: number) => {
      let n = 0;
      for (let y = y0; y < y0 + 20; y++)
        for (let x = x0; x < x0 + 20; x++)
          for (let c = 0; c < 3; c++) if (px[(y * 100 + x) * 4 + c] !== before[(y * 100 + x) * 4 + c]) n++;
      return n / (20 * 20 * 3);
    };
    expect(changed(10, 10)).toBeGreaterThan(0.5);
    expect(changed(60, 20)).toBeGreaterThan(0.5);
  });
});

describe('shapes and edges', () => {
  const red = (px: Uint8ClampedArray, x: number, y: number) => px[(y * 100 + x) * 4]!;

  it('covers faces with an ellipse: centre masked, far box corner left alone', () => {
    const out = createCanvas(100, 80);
    const ctx = out.getContext('2d');
    renderCloak(
      ctx as unknown as Ctx2D,
      source() as unknown as CanvasImageSource,
      100,
      80,
      [zone(20, 10, 40, 60, true, 'face')],
      'opaque',
    );
    const px = ctx.getImageData(0, 0, 100, 80).data as unknown as Uint8ClampedArray;
    expect(red(px, 40, 40)).toBe(0x0b);
    expect(red(px, 20, 10)).toBe(40); // corner of the face box: outside the ellipse, untouched
    expect(coverage(40, 40, shapeOf(zone(20, 10, 40, 60, true, 'face')), 0)).toBe(1);
  });

  it('blur fades out softly outside the zone and never inside it', () => {
    const s = shapeOf(zone(20, 20, 40, 40));
    const feather = 14;
    expect(coverage(20.5, 40, s, feather)).toBe(1); // inside the zone edge
    const mid = coverage(27 + 40, 40, s, feather);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(coverage(60 + feather + 1, 40, s, feather)).toBe(0);
    expect(coverage(61, 40, s, 0)).toBe(0); // hard edge for mosaic and solid
  });
});
