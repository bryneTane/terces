// Dev server only: serve the ONNX Runtime files in public/ort/ as they are. The runtime loads its
// .mjs glue with a dynamic import(), and Vite would otherwise try to transform that request and
// refuse it because the file lives in public/. The production build serves them as static files.
import { createReadStream, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import type { Plugin } from 'vite';
import { ISOLATION_HEADERS } from './headers.ts';

const TYPES: Record<string, string> = { '.mjs': 'text/javascript', '.json': 'application/json' };

export function serveOrtRaw(publicDir = 'public'): Plugin {
  return {
    name: 'terces:serve-ort-raw',
    apply: 'serve',
    configureServer(server) {
      // Registered directly (not returned), so it runs before Vite's own transform middleware.
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]!;
        const ext = path.slice(path.lastIndexOf('.'));
        if (!path.startsWith('/ort/') || !(ext in TYPES)) return next();
        const file = normalize(join(publicDir, path));
        if (!file.startsWith(normalize(join(publicDir, 'ort'))) || !existsSync(file)) return next();
        res.setHeader('Content-Type', TYPES[ext]!);
        for (const [k, v] of Object.entries(ISOLATION_HEADERS)) res.setHeader(k, v);
        createReadStream(file).pipe(res);
      });
    },
  };
}
