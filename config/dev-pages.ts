// Dev server only: send /admin to /admin/. Without the slash, Vite falls back to the main app's
// index.html. Cloudflare Pages already does this redirect in production.
import type { Plugin } from 'vite';

export function devPageRedirects(pages = ['/admin']): Plugin {
  return {
    name: 'terces:dev-page-redirects',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [path, query] = (req.url ?? '').split('?');
        if (!path || !pages.includes(path)) return next();
        res.statusCode = 301;
        res.setHeader('Location', `${path}/${query ? `?${query}` : ''}`);
        res.end();
      });
    },
  };
}
