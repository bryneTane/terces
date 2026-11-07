import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { ICE, rgb } from '../../src/styles/palette.ts';

it('tokens.css and palette.ts agree', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  for (const [name, hex] of Object.entries(ICE)) expect(css).toContain(`--color-${name}: ${hex};`);
});

it('converts hex to shader RGB', () => {
  expect(rgb('#ff8000')).toEqual([1, 128 / 255, 0]);
});
