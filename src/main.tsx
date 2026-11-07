import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/index.css';
import { detectLocale, readStoredLocale, type Locale } from './i18n.tsx';
import { Root } from './Root.tsx';
import { registerSW } from 'virtual:pwa-register';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// /fr/ is the French page; elsewhere the stored choice or the device language decides.
const locale: Locale = /^\/fr(\/|$)/.test(location.pathname)
  ? 'fr'
  : detectLocale(navigator.language, readStoredLocale());
document.documentElement.lang = locale;
const app = (
  <StrictMode>
    <Root locale={locale} />
  </StrictMode>
);
// The landing page is pre-rendered in one language. Hydrate it when it matches, else render fresh.
if (root.hasChildNodes() && root.dataset.locale === locale) hydrateRoot(root, app);
else {
  root.replaceChildren();
  createRoot(root).render(app);
}

// Offline support: the app shell is precached; models are cached on first use.
if ('serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true });
