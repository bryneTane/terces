import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { translate, type Locale } from './i18n.tsx';
import { Root } from './Root.tsx';

/** The landing page as HTML, for crawlers and a fast first paint. The client hydrates it. */
export function render(locale: Locale): string {
  return renderToString(
    <StrictMode>
      <Root locale={locale} />
    </StrictMode>,
  );
}

export const t = translate;
