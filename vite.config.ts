import { defaultClientConditions, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { modelCacheName } from './config/cache.ts';
import { ISOLATION_HEADERS, SECURITY_HEADERS } from './config/headers.ts';
import { pwaOptions } from './config/pwa.ts';
import { serveOrtRaw } from './config/serve-ort.ts';
import { devPageRedirects } from './config/dev-pages.ts';

const MODEL_CACHE = modelCacheName();

// Dev server: isolation headers only. The React Fast Refresh preamble is an inline script that a
// strict CSP would block. Preview and production enforce the full CSP, and E2E tests run on preview.
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions(MODEL_CACHE)), serveOrtRaw(), devPageRedirects()],
  define: { __MODEL_CACHE__: JSON.stringify(MODEL_CACHE) },
  // Use the onnxruntime-web build that loads its WASM from /ort/ instead of bundling a 29 MB file.
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions] },
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: SECURITY_HEADERS },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2023',
    rollupOptions: {
      input: {
        main: 'index.html',
        lab: 'lab.html',
        admin: 'admin/index.html',
      },
    },
  },
});
