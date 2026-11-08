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
  secretNames,
  withDatabaseId,
} from '../../scripts/deploy.ts';

// wrangler.toml with the placeholder database id (`pnpm deploy:setup` fills in the real one).
const toml = readFileSync('wrangler.toml', 'utf8').replace(
  /database_id = "[^"]*"[^\n]*/,
  'database_id = "00000000-0000-0000-0000-000000000000"',
);
const ready = withDatabaseId(toml, '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b');
const SECRETS = ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD'];

describe('deploy script', () => {
  it('parses modes and refuses a quick production deploy', () => {
    expect(parseArgs(['preview', '--quick'])).toEqual({ mode: 'preview', quick: true, yes: false });
    expect(parseArgs(['prod', '--yes'])).toEqual({ mode: 'prod', quick: false, yes: true });
    expect(parseArgs(['preview', '--branch', 'demo'])).toMatchObject({ branch: 'demo' });
    expect(() => parseArgs(['prod', '--quick'])).toThrow(/previews only/);
    expect(() => parseArgs(['ship'])).toThrow(/usage/);
  });

  it('needs the database id and both Access secrets for production', () => {
    expect(configProblems(toml, 'prod', []).errors).toHaveLength(3);
    expect(configProblems(ready, 'prod', ['ACCESS_AUD']).errors).toEqual([
      'ACCESS_TEAM_DOMAIN is not set: pnpm wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name terces',
    ]);
    expect(configProblems(ready, 'prod', SECRETS)).toEqual({ errors: [], warnings: [] });
    expect(configProblems(ready, 'prod', null).errors).toEqual([
      'Could not list the Pages secrets (`wrangler pages secret list`)',
    ]);
  });

  it('keeps the Access settings out of wrangler.toml', () => {
    expect(toml).not.toMatch(/^\s*ACCESS_/m);
    const withVar = `${ready}\n[vars]\nACCESS_AUD = "abc"\n`;
    expect(configProblems(withVar, 'prod', SECRETS).errors).toEqual([
      'ACCESS_AUD is in wrangler.toml: remove it, it is a Pages secret',
    ]);
  });

  it('lets a preview go out before Access is configured, with warnings', () => {
    expect(configProblems(ready, 'preview', []).errors).toEqual([]);
    expect(configProblems(ready, 'preview', []).warnings).toEqual([
      'ACCESS_TEAM_DOMAIN is not set: pnpm wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name terces --env preview (until then /admin answers 401)',
      'ACCESS_AUD is not set: pnpm wrangler pages secret put ACCESS_AUD --project-name terces --env preview (until then /admin answers 401)',
    ]);
    expect(configProblems(toml, 'preview', []).errors).toHaveLength(1);
  });

  it('reads secret names, never values, from the wrangler listing', () => {
    const out = [
      'The "production" environment of your Pages project "terces" has access to the following secrets:',
      '  - ACCESS_AUD: Value Encrypted',
      '  - ACCESS_TEAM_DOMAIN: Value Encrypted',
    ].join('\n');
    expect(secretNames(out)).toEqual(['ACCESS_AUD', 'ACCESS_TEAM_DOMAIN']);
    expect(secretNames('')).toEqual([]);
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
