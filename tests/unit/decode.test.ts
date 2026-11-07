import { describe, expect, it, vi } from 'vitest';
import {
  DecodeError,
  MAX_PIXELS,
  decodePhoto,
  fitWithin,
  isHeic,
  looksLikeImage,
} from '../../src/lib/decode.ts';

const bmp = (width: number, height: number) => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;
const jpeg = new File(['x'], 'p.jpg', { type: 'image/jpeg' });

describe('fitWithin', () => {
  it('keeps images under the cap', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 4000, height: 3000, downscaled: false });
  });

  it('scales 48 MP down under 16.7 MP, keeping the aspect ratio', () => {
    const f = fitWithin(8000, 6000);
    expect(f.downscaled).toBe(true);
    expect(f.width * f.height).toBeLessThanOrEqual(MAX_PIXELS);
    expect(f.width / f.height).toBeCloseTo(8000 / 6000, 2);
  });
});

describe('file checks', () => {
  it('recognizes HEIC and images without a MIME type', () => {
    expect(isHeic({ name: 'IMG_0001.HEIC', type: '' })).toBe(true);
    expect(isHeic({ name: 'a', type: 'image/heif' })).toBe(true);
    expect(looksLikeImage({ name: 'a.png', type: '' })).toBe(true);
    expect(looksLikeImage({ name: 'notes.pdf', type: 'application/pdf' })).toBe(false);
  });
});

describe('decodePhoto', () => {
  it('returns the oriented bitmap when under the cap', async () => {
    const create = vi.fn(async () => bmp(300, 400));
    const d = await decodePhoto(jpeg, { createImageBitmap: create });
    expect(d).toMatchObject({ width: 300, height: 400, downscaled: false });
    expect(create).toHaveBeenCalledWith(jpeg, { imageOrientation: 'from-image' });
  });

  it('downscales large images and closes the full-size bitmap', async () => {
    const full = bmp(8000, 6000);
    const create = vi.fn(async (_s: ImageBitmapSource, o?: ImageBitmapOptions) =>
      o?.resizeWidth ? bmp(o.resizeWidth, o.resizeHeight!) : full,
    );
    const d = await decodePhoto(jpeg, { createImageBitmap: create });
    expect(d.downscaled).toBe(true);
    expect(d.width * d.height).toBeLessThanOrEqual(MAX_PIXELS);
    expect(full.close).toHaveBeenCalled();
  });

  it('falls back to canvas scaling when resize options are ignored', async () => {
    const create = vi.fn(async () => bmp(8000, 6000));
    const scale = vi.fn(async (_b: ImageBitmap, w: number, h: number) => bmp(w, h));
    const d = await decodePhoto(jpeg, { createImageBitmap: create, scale });
    expect(scale).toHaveBeenCalled();
    expect(d.bitmap.width).toBe(d.width);
  });

  it('maps failures to decode and heic errors, and rejects non-images', async () => {
    const fail = vi.fn(async () => {
      throw new Error('bad');
    });
    await expect(decodePhoto(jpeg, { createImageBitmap: fail })).rejects.toMatchObject({
      appError: { code: 'decode' },
    });
    const heic = new File(['x'], 'IMG.HEIC', { type: 'image/heic' });
    await expect(decodePhoto(heic, { createImageBitmap: fail })).rejects.toMatchObject({
      appError: { code: 'heic' },
    });
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await expect(decodePhoto(pdf, { createImageBitmap: fail })).rejects.toBeInstanceOf(DecodeError);
  });
});
