import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAGES, SITE, inject } from '../../scripts/prerender.ts';

const template = readFileSync('index.html', 'utf8');

describe('prerender inject', () => {
  it('fills the root and sets language, canonical, alternates and structured data', () => {
    const fr = PAGES[1];
    const html = inject(template, fr, '<main>Bonjour</main>', 'Titre "fr"', 'Desc <b>');
    expect(html).toContain('<html lang="fr"');
    expect(html).toContain('<div id="root" data-locale="fr"><main>Bonjour</main></div>');
    expect(html).toContain('<title>Titre &quot;fr&quot;</title>');
    expect(html).toContain('<meta name="description" content="Desc &lt;b&gt;" />');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/fr/" />`);
    expect(html).toContain(`hreflang="en" href="${SITE}/"`);
    expect(html).toContain(`hreflang="x-default" href="${SITE}/"`);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]!);
    expect(ld).toMatchObject({ '@type': 'WebApplication', inLanguage: 'fr', isAccessibleForFree: true });
    expect(html).not.toMatch(/<script type="application\/ld\+json">[^]*<b>/);
  });

  it('refuses a template without an empty root', () => {
    expect(() =>
      inject('<html lang="en"><head></head><body></body></html>', PAGES[0], 'x', 't', 'd'),
    ).toThrow();
  });
});
