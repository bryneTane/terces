// App icons and the social preview image, drawn from scratch (no photo, no external asset).
// Run: pnpm icons. Outputs are committed in public/.
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { ICE } from '../src/styles/palette.ts';
import { SYMBOL, cutsPath, drawSymbol, drawWordmark, symbolPath } from '../src/styles/mark.ts';

const fonts = 'node_modules/@fontsource';
GlobalFonts.registerFromPath(
  `${fonts}/space-grotesk/files/space-grotesk-latin-600-normal.woff2`,
  'Space Grotesk',
);
GlobalFonts.registerFromPath(
  `${fonts}/space-grotesk/files/space-grotesk-latin-700-normal.woff2`,
  'Space Grotesk',
);
GlobalFonts.registerFromPath(`${fonts}/inter/files/inter-latin-400-normal.woff2`, 'Inter');
GlobalFonts.registerFromPath(
  `${fonts}/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2`,
  'JetBrains Mono',
);

const C = ICE;

function icon(size: number, maskable: boolean) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, size, size);
  // Maskable icons keep the mark inside the 80% safe zone.
  const s = size * (maskable ? 0.6 : 0.74);
  drawSymbol(ctx, (size - s) / 2, (size - s) / 2, s, { main: C.accent, accent: C.alert, bg: C.void });
  return c.toBuffer('image/png');
}

/** Favicon: the symbol on a dark rounded tile, so it shows on light browser tabs too. */
const TILE_RADIUS = 14;
function favicon(size: number) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.void;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, (TILE_RADIUS / 64) * size);
  ctx.fill();
  const pad = size * 0.06;
  drawSymbol(ctx, pad, pad, size - pad * 2, { main: C.accent, accent: C.alert, bg: C.void });
  return c.toBuffer('image/png');
}

function faviconSvg() {
  const d = SYMBOL.dot;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><mask id="m"><rect width="64" height="64" fill="#fff"/><path d="${cutsPath}" stroke="#000" stroke-width="${SYMBOL.cutWidth}"/></mask><rect width="64" height="64" rx="${TILE_RADIUS}" fill="${C.void}"/><g transform="translate(2 2) scale(0.94)"><path d="${symbolPath}" fill-rule="evenodd" fill="${C.accent}" mask="url(#m)"/><circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="${C.alert}"/></g></svg>\n`;
}

function og() {
  const W = 1200;
  const H = 630;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
  drawSymbol(ctx, 800, 155, 320, { main: C.accent, accent: C.alert, bg: C.void });
  drawSymbol(ctx, 80, 90, 58, { main: C.accent, accent: C.alert, bg: C.void });
  drawWordmark(ctx, 158, 106, 26, { main: C.ink, accent: C.alert });
  ctx.fillStyle = C.ink;
  ctx.font = '700 66px "Space Grotesk"';
  ctx.fillText('See what your photo', 80, 270);
  ctx.fillStyle = C.accent;
  ctx.fillText('gives away.', 80, 350);
  ctx.fillStyle = C.alert;
  ctx.fillText('Then cloak it.', 80, 430);
  ctx.fillStyle = C.dim;
  ctx.font = '400 28px Inter';
  ctx.fillText('Runs on your phone. Nothing is uploaded.', 80, 530);
  return c.toBuffer('image/png');
}

writeFileSync('public/icons/icon-192.png', icon(192, false));
writeFileSync('public/icons/icon-512.png', icon(512, false));
writeFileSync('public/icons/icon-maskable-512.png', icon(512, true));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, false));
writeFileSync('public/favicon.png', favicon(64));
writeFileSync('public/favicon.svg', faviconSvg());
writeFileSync('public/og.png', og());
console.log('icons and og.png written');
