// @vitest-environment node
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CARD_H,
  CARD_W,
  renderShareCard,
  type CanvasFactory,
  type ShareCardInput,
  type ToPng,
} from '../../src/lib/shareCard.ts';

const texts: string[] = [];
const factory: CanvasFactory = (w, h) => {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const fill = ctx.fillText.bind(ctx);
  ctx.fillText = (t: string, x: number, y: number) => {
    texts.push(t);
    fill(t, x, y);
  };
  return c as unknown as ReturnType<CanvasFactory>;
};
const toPng: ToPng = async (c) =>
  new Blob([new Uint8Array((c as unknown as { toBuffer(t: 'image/png'): Buffer }).toBuffer('image/png'))], {
    type: 'image/png',
  });

function pngSize(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

describe('share card', () => {
  it('is a 1080 x 1350 PNG', async () => {
    const blob = await renderShareCard(
      { count: 7, breakdown: { metadata: 3, face: 3, text: 1 }, locale: 'en' },
      factory,
      toPng,
    );
    expect(blob.type).toBe('image/png');
    expect(pngSize(new Uint8Array(await blob.arrayBuffer()))).toEqual({ w: CARD_W, h: CARD_H });
  });

  it('writes the count and the app address, in English and French', async () => {
    texts.length = 0;
    await renderShareCard({ count: 7, breakdown: { face: 3, plate: 1 }, locale: 'en' }, factory, toPng);
    const en = texts.join(' ');
    expect(en).toContain('7');
    expect(en).toContain('My photo gave away 7 things.');
    expect(en).toContain('Check yours.');
    expect(en).toContain('3 faces');
    expect(en).toContain('1 licence plate');
    expect(en).toContain('terces.pages.dev');
    texts.length = 0;
    await renderShareCard({ count: 1, breakdown: { metadata: 1 }, locale: 'fr' }, factory, toPng);
    expect(texts.join(' ')).toContain('Ma photo révélait 1 information sur moi.');
  });

  it('cannot take an image or text from the photo', () => {
    expectTypeOf<keyof ShareCardInput>().toEqualTypeOf<'count' | 'breakdown' | 'locale'>();
    expectTypeOf<ShareCardInput['breakdown'][keyof ShareCardInput['breakdown']]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<ShareCardInput['count']>().toEqualTypeOf<number>();
  });
});

it.runIf(process.env.CARD_OUT)('writes a sample card for visual review', async () => {
  const { writeFileSync } = await import('node:fs');
  const blob = await renderShareCard(
    { count: 10, breakdown: { metadata: 6, face: 3, text: 1 }, locale: 'en' },
    factory,
    toPng,
  );
  writeFileSync(process.env.CARD_OUT!, new Uint8Array(await blob.arrayBuffer()));
});
