// Service worker config: precache the app shell, cache models and ORT on first use, never
// cache or replay the usage counter, never touch the admin page or the device lab.
import type { VitePWAOptions } from 'vite-plugin-pwa';

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
      navigateFallbackDenylist: [/^\/api\//, /^\/admin/, /^\/lab\.html/],
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
