// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  configProblems,
  deployArgs,
  distProblems,
  findDatabaseId,
  parseArgs,
  previewBranch,
  withDatabaseId,
} from '../../scripts/deploy.ts';

// The committed wrangler.toml with its placeholders (the working copy gets real values from
// `pnpm deploy:setup`, so it cannot be the fixture).
const toml = readFileSync('wrangler.toml', 'utf8')
  .replace(/database_id = "[^"]*"[^\n]*/, 'database_id = "00000000-0000-0000-0000-000000000000"')
  .replace(/ACCESS_TEAM_DOMAIN = "[^"]*"[^\n]*/, 'ACCESS_TEAM_DOMAIN = "example.cloudflareaccess.com"')
  .replace(/ACCESS_AUD = "[^"]*"/, 'ACCESS_AUD = "replace-with-access-application-aud-tag"');
const ready = withDatabaseId(toml, '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b')
  .replace(/ACCESS_TEAM_DOMAIN = "[^"]*"[^\n]*/, 'ACCESS_TEAM_DOMAIN = "me.cloudflareaccess.com"')
  .replace(/ACCESS_AUD = "[^"]*"/, 'ACCESS_AUD = "abc123"');

describe('deploy script', () => {
  it('parses modes and refuses a quick production deploy', () => {
    expect(parseArgs(['preview', '--quick'])).toEqual({ mode: 'preview', quick: true, yes: false });
    expect(parseArgs(['prod', '--yes'])).toEqual({ mode: 'prod', quick: false, yes: true });
    expect(parseArgs(['preview', '--branch', 'demo'])).toMatchObject({ branch: 'demo' });
    expect(() => parseArgs(['prod', '--quick'])).toThrow(/previews only/);
    expect(() => parseArgs(['ship'])).toThrow(/usage/);
  });

  it('flags every placeholder in wrangler.toml, and none once filled', () => {
    expect(configProblems(toml, 'prod').errors).toHaveLength(3);
    expect(configProblems(ready, 'prod')).toEqual({ errors: [], warnings: [] });
  });

  it('lets a preview go out before Access is configured, with warnings', () => {
    const dbOnly = withDatabaseId(toml, '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b');
    expect(configProblems(dbOnly, 'preview').errors).toEqual([]);
    expect(configProblems(dbOnly, 'preview').warnings).toHaveLength(2);
    expect(configProblems(dbOnly, 'prod').errors).toHaveLength(2);
    expect(configProblems(toml, 'preview').errors).toHaveLength(1);
  });

  it('never deploys a preview onto the production branch', () => {
    expect(previewBranch('main')).toBe('preview');
    expect(previewBranch(null)).toBe('preview');
    expect(previewBranch('feature/Ice HUD')).toBe('feature-ice-hud');
    expect(previewBranch('x', 'main')).toBe('preview');
  });

  it('builds the wrangler command', () => {
    expect(deployArgs('preview', { hash: 'abc', message: 'msg', dirty: true })).toEqual([
      'wrangler',
      'pages',
      'deploy',
      'dist',
      '--project-name',
      'terces',
      '--branch',
      'preview',
      '--commit-hash',
      'abc',
      '--commit-message',
      'msg',
      '--commit-dirty=true',
    ]);
  });

  it('finds the database id and writes it into the config', () => {
    expect(findDatabaseId('[{"name":"other","uuid":"1"},{"name":"terces-usage","uuid":"2"}]')).toBe('2');
    expect(findDatabaseId('[]')).toBeNull();
    expect(withDatabaseId(toml, 'abc')).toContain('database_id = "abc"');
  });

  it('refuses a build without the privacy headers', () => {
    expect(distProblems(() => null)).toHaveLength(4);
    const files: Record<string, string> = {
      'dist/_headers':
        "Content-Security-Policy: default-src 'self'\nCross-Origin-Embedder-Policy: require-corp",
      'dist/_routes.json': '{"include":["/api/*"]}',
      'dist/sw.js': 'x',
    };
    expect(distProblems((p) => files[p] ?? null)).toEqual([]);
  });
});
