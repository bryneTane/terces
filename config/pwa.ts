// Service worker config: precache the app shell, cache models and ORT on first use, never
// cache or replay the usage counter, never touch the admin page, the device lab, or anything else
// the server answers (Cloudflare Access sets its login cookie at /cdn-cgi/access/authorized).
import type { VitePWAOptions } from 'vite-plugin-pwa';

/** The app's pages: / and /fr/ (workbox tests pathname + search). */
export const APP_PAGES = /^\/(fr\/)?(index\.html)?(\?.*)?$/;

export function pwaOptions(modelCache: string): Partial<VitePWAOptions> {
  return {
    strategies: 'generateSW',
    registerType: 'autoUpdate',
    injectRegister: false,
    manifest: false,
    workbox: {
      globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest,woff2}', 'geo/*.json', 'hero/*.webp'],
      globIgnores: ['lab.html', 'admin/**', 'assets/lab-*', 'assets/admin-*', 'models/**', 'ort/**'],
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      navigateFallback: '/index.html',
      // Only the app's own pages fall back to the cached shell (offline, any query string); every
      // other navigation goes to the network. A denylist missed /cdn-cgi/ and broke the admin login.
      navigateFallbackAllowlist: [APP_PAGES],
      clientsClaim: true,
      skipWaiting: true,
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
        {
          urlPattern: ({ url }) => url.pathname.startsWith('/models/') || url.pathname.startsWith('/ort/'),
          handler: 'CacheFirst',
          // Requests from the worker carry an Origin header; the cached copies were stored without one.
          options: { cacheName: modelCache, matchOptions: { ignoreVary: true } },
        },
      ],
    },
  };
}
