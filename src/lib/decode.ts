// Decode a picked file into an oriented ImageBitmap, capped to the iOS canvas area limit.
import type { AppError } from './types.ts';

/** iOS Safari refuses canvases above 16,777,216 pixels. */
export const MAX_PIXELS = 16_777_216;

export interface Decoded {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  downscaled: boolean;
}

export class DecodeError extends Error {
  constructor(public readonly appError: AppError) {
    super(appError.code);
  }
}

export function fitWithin(width: number, height: number, max = MAX_PIXELS) {
  if (width * height <= max) return { width, height, downscaled: false };
  const scale = Math.sqrt(max / (width * height));
  return { width: Math.floor(width * scale), height: Math.floor(height * scale), downscaled: true };
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp)$/i;

export function isHeic(file: Pick<File, 'name' | 'type'>): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export function looksLikeImage(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type.startsWith('image/') || (!file.type && IMAGE_EXT.test(file.name));
}

type CreateBitmap = (src: ImageBitmapSource, options?: ImageBitmapOptions) => Promise<ImageBitmap>;

interface Deps {
  createImageBitmap: CreateBitmap;
  /** Fallback when `resizeWidth` is ignored (older Safari): redraw at the capped size. */
  scale?: (bitmap: ImageBitmap, width: number, height: number) => Promise<ImageBitmap>;
}

async function scaleWithCanvas(bitmap: ImageBitmap, width: number, height: number): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return createImageBitmap(canvas);
}

export async function decodePhoto(
  file: File,
  deps: Deps = { createImageBitmap: (s, o) => createImageBitmap(s, o) },
): Promise<Decoded> {
  if (!looksLikeImage(file)) throw new DecodeError({ code: 'decode', message: 'not an image' });
  let full: ImageBitmap;
  try {
    full = await deps.createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    throw new DecodeError({
      code: isHeic(file) ? 'heic' : 'decode',
      message: String((e as Error)?.message ?? e),
    });
  }
  const fit = fitWithin(full.width, full.height);
  if (!fit.downscaled) return { bitmap: full, width: full.width, height: full.height, downscaled: false };

  try {
    let scaled = await deps.createImageBitmap(file, {
      imageOrientation: 'from-image',
      resizeWidth: fit.width,
      resizeHeight: fit.height,
      resizeQuality: 'high',
    });
    if (scaled.width !== fit.width || scaled.height !== fit.height) {
      scaled.close();
      scaled = await (deps.scale ?? scaleWithCanvas)(full, fit.width, fit.height);
    }
    return { bitmap: scaled, width: fit.width, height: fit.height, downscaled: true };
  } catch (e) {
    throw new DecodeError({ code: 'oom', message: String((e as Error)?.message ?? e) });
  } finally {
    full.close();
  }
}
