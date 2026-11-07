// Pre-renders the landing page into dist/index.html (English) and dist/fr/index.html (French),
// with per-language titles, canonical and hreflang links, and structured data. Runs after `vite build`.
import react from '@vitejs/plugin-react';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, defaultServerConditions } from 'vite';
import { modelCacheName } from '../config/cache.ts';

export const SITE = 'https://terces.pages.dev';
export const PAGES = [
  { locale: 'en', path: '/', file: 'index.html', og: 'en_US' },
  { locale: 'fr', path: '/fr/', file: 'fr/index.html', og: 'fr_FR' },
] as const;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Puts the rendered app and the page's head tags into the built index.html. */
export function inject(
  template: string,
  page: (typeof PAGES)[number],
  app: string,
  title: string,
  description: string,
): string {
  const alternates = PAGES.map(
    (p) => `<link rel="alternate" hreflang="${p.locale}" href="${SITE}${p.path}" />`,
  ).join('\n    ');
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Terces',
    url: `${SITE}${page.path}`,
    description,
    inLanguage: page.locale,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript and WebAssembly',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  }).replace(/</g, '\\u003c');
  const head = [
    `<link rel="canonical" href="${SITE}${page.path}" />`,
    alternates,
    `<link rel="alternate" hreflang="x-default" href="${SITE}/" />`,
    `<meta property="og:url" content="${SITE}${page.path}" />`,
    `<meta property="og:locale" content="${page.og}" />`,
    `<script type="application/ld+json">${ld}</script>`,
  ].join('\n    ');
  // Tags may be wrapped over several lines (formatter), so match any whitespace. Every
  // replacement must hit: a silent miss would ship the wrong language in the page head.
  const rules: [RegExp, string][] = [
    [/<html\s+lang="[^"]*"/, `<html lang="${page.locale}"`],
    [/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`],
    [
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${esc(description)}" />`,
    ],
    [
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:title" content="${esc(title)}" />`,
    ],
    [
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:description" content="${esc(description)}" />`,
    ],
    [/<\/head>/, `  ${head}\n  </head>`],
    [/<div id="root"><\/div>/, `<div id="root" data-locale="${page.locale}">${app}</div>`],
  ];
  let out = template;
  for (const [re, value] of rules) {
    if (!re.test(out)) throw new Error(`index.html: nothing matches ${re}`);
    out = out.replace(re, () => value);
  }
  return out;
}

async function main() {
  const out = 'node_modules/.prerender';
  await build({
    configFile: false,
    logLevel: 'warn',
    plugins: [react()],
    define: { __MODEL_CACHE__: JSON.stringify(modelCacheName()) },
    resolve: { conditions: ['onnxruntime-web-use-extern-wasm', ...defaultServerConditions] },
    build: { ssr: 'src/entry-server.tsx', outDir: out, emptyOutDir: true },
  });
  const mod = (await import(pathToFileURL(join(out, 'entry-server.js')).href)) as {
    render: (l: string) => string;
    t: (l: string, k: string) => string;
  };
  const template = readFileSync('dist/index.html', 'utf8');
  for (const page of PAGES) {
    const html = inject(
      template,
      page,
      mod.render(page.locale),
      mod.t(page.locale, 'meta.title'),
      mod.t(page.locale, 'meta.description'),
    );
    mkdirSync(join('dist', page.file, '..'), { recursive: true });
    writeFileSync(join('dist', page.file), html);
  }
  rmSync(out, { recursive: true, force: true });
  console.log(`prerendered ${PAGES.map((p) => p.path).join(', ')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
