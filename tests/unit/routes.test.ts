import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('_routes.json sends only /api and /admin to Functions', () => {
  const routes = JSON.parse(readFileSync('public/_routes.json', 'utf8'));
  expect(routes).toEqual({ version: 1, include: ['/api/*', '/admin', '/admin/*'], exclude: [] });
});
