// Deploys Terces to Cloudflare Pages.
//
//   pnpm deploy:setup     one time: create the Pages project and the D1 database, fill wrangler.toml
//   pnpm deploy:preview   checks, build, remote migrations, deploy to a preview URL
//   pnpm deploy:prod      same, to production (clean git tree and a typed confirmation required)
//
// Flags: --quick (typecheck, unit tests and build only, preview only), --yes (skip the confirmation),
// --branch <name> (preview branch name, default: current git branch).
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

export const PROJECT = 'terces';
export const DATABASE = 'terces-usage';
export const PRODUCTION_BRANCH = 'main';
const PLACEHOLDER_DB = '00000000-0000-0000-0000-000000000000';

export type Mode = 'setup' | 'preview' | 'prod';

export interface Options {
  mode: Mode;
  quick: boolean;
  yes: boolean;
  branch?: string;
}

export function parseArgs(argv: string[]): Options {
  const mode = argv[0];
  if (mode !== 'setup' && mode !== 'preview' && mode !== 'prod')
    throw new Error('usage: deploy.ts <setup|preview|prod> [--quick] [--yes] [--branch name]');
  const i = argv.indexOf('--branch');
  const branch = i >= 0 ? argv[i + 1] : undefined;
  if (i >= 0 && !branch) throw new Error('--branch needs a name');
  const quick = argv.includes('--quick');
  if (quick && mode === 'prod')
    throw new Error('--quick is for previews only: production always runs the full check');
  return { mode, quick, yes: argv.includes('--yes'), ...(branch ? { branch } : {}) };
}

/**
 * Problems in wrangler.toml. The database id always blocks. Missing Access settings block
 * production only: on a preview the admin page and stats simply refuse everyone (fail closed).
 */
export function configProblems(toml: string, mode: Mode = 'prod'): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const access: string[] = [];
  if (toml.includes(PLACEHOLDER_DB) || !/database_id\s*=\s*"[0-9a-f-]{36}"/.test(toml))
    errors.push('database_id is still the placeholder: run `pnpm deploy:setup`');
  if (/ACCESS_TEAM_DOMAIN\s*=\s*"(example\.|<)/.test(toml))
    access.push(
      'ACCESS_TEAM_DOMAIN is a placeholder: set your Zero Trust team domain (e.g. myteam.cloudflareaccess.com)',
    );
  if (/ACCESS_AUD\s*=\s*"(replace-with|<)/.test(toml))
    access.push(
      'ACCESS_AUD is a placeholder: set the Application Audience (AUD) tag of the Access app for /admin',
    );
  return mode === 'prod'
    ? { errors: [...errors, ...access], warnings: [] }
    : { errors, warnings: access.map((w) => `${w} (until then /admin answers 401)`) };
}

/** Preview branch names become part of the URL (<branch>.terces.pages.dev). */
export function previewBranch(gitBranch: string | null, override?: string): string {
  const raw = override ?? (gitBranch && gitBranch !== PRODUCTION_BRANCH ? gitBranch : 'preview');
  const clean = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  if (!clean || clean === PRODUCTION_BRANCH) return 'preview';
  return clean;
}

export function deployArgs(
  branch: string,
  commit: { hash: string | null; message: string | null; dirty: boolean },
): string[] {
  const args = ['wrangler', 'pages', 'deploy', 'dist', '--project-name', PROJECT, '--branch', branch];
  if (commit.hash) args.push('--commit-hash', commit.hash);
  if (commit.message) args.push('--commit-message', commit.message.slice(0, 200));
  if (commit.dirty) args.push('--commit-dirty=true');
  return args;
}

/** The database id in `wrangler d1 list --json` output. */
export function findDatabaseId(listJson: string, name = DATABASE): string | null {
  const list = JSON.parse(listJson) as { name: string; uuid: string }[];
  return list.find((d) => d.name === name)?.uuid ?? null;
}

export function withDatabaseId(toml: string, id: string): string {
  return toml.replace(/database_id\s*=\s*"[^"]*"[^\n]*/, `database_id = "${id}"`);
}

/** The built output must carry the privacy headers and the Functions routes. */
export function distProblems(read: (p: string) => string | null): string[] {
  const out: string[] = [];
  const headers = read('dist/_headers');
  if (!headers?.includes("Content-Security-Policy: default-src 'self'"))
    out.push('dist/_headers is missing the Content-Security-Policy');
  if (!headers?.includes('Cross-Origin-Embedder-Policy: require-corp'))
    out.push('dist/_headers is missing cross-origin isolation');
  if (!read('dist/_routes.json')?.includes('/api/*')) out.push('dist/_routes.json is missing');
  if (!read('dist/sw.js')) out.push('dist/sw.js (service worker) is missing');
  return out;
}

// ---- Side effects below ----

function run(cmd: string, args: string[], opts: SpawnSyncOptions = {}): void {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

function capture(cmd: string, args: string[]): string | null {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const pnpm = (...args: string[]) => run('pnpm', args);
const fail = (lines: string[]) => {
  for (const l of lines) console.error(`  - ${l}`);
  process.exit(1);
};

function requireLogin() {
  if (capture('pnpm', ['-s', 'wrangler', 'whoami'])?.includes('You are logged in') !== true) {
    fail(['Not logged in to Cloudflare: run `pnpm wrangler login` first']);
  }
}

async function confirm(question: string, expected: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim() === expected;
}

function setup() {
  requireLogin();
  const projects = capture('pnpm', ['-s', 'wrangler', 'pages', 'project', 'list', '--json']);
  const exists = projects
    ? (JSON.parse(projects) as { 'Project Name'?: string; name?: string }[]).some(
        (p) => (p['Project Name'] ?? p.name) === PROJECT,
      )
    : false;
  if (exists) console.log(`Pages project "${PROJECT}" already exists.`);
  else pnpm('wrangler', 'pages', 'project', 'create', PROJECT, '--production-branch', PRODUCTION_BRANCH);

  let id = findDatabaseId(capture('pnpm', ['-s', 'wrangler', 'd1', 'list', '--json']) ?? '[]');
  if (id) console.log(`D1 database "${DATABASE}" already exists.`);
  else {
    pnpm('wrangler', 'd1', 'create', DATABASE);
    id = findDatabaseId(capture('pnpm', ['-s', 'wrangler', 'd1', 'list', '--json']) ?? '[]');
    if (!id) fail([`Could not find the id of "${DATABASE}" after creating it`]);
  }
  writeFileSync('wrangler.toml', withDatabaseId(readFileSync('wrangler.toml', 'utf8'), id!));
  console.log(`wrangler.toml: database_id = "${id}"`);
  pnpm('wrangler', 'd1', 'migrations', 'apply', DATABASE, '--remote');

  const left = configProblems(readFileSync('wrangler.toml', 'utf8')).errors;
  console.log('\nDone with what can be scripted. Still to do in the Cloudflare dashboard:');
  console.log('  1. Zero Trust > Access > Applications: add a self-hosted app for terces.pages.dev/admin*');
  console.log('     and *.terces.pages.dev/admin* (previews), allowing only your email.');
  console.log('     Copy its Application Audience (AUD) tag and your team domain into wrangler.toml [vars].');
  console.log('  2. Optional: a rate limiting rule on /api/hit.');
  if (left.length) {
    console.log('\nwrangler.toml still has:');
    for (const l of left) console.log(`  - ${l}`);
  }
}

async function deploy(o: Options) {
  const { errors, warnings } = configProblems(readFileSync('wrangler.toml', 'utf8'), o.mode);
  if (errors.length) fail(['wrangler.toml is not ready:', ...errors]);
  for (const w of warnings) console.warn(`Warning: ${w}`);
  requireLogin();

  const gitBranch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = (capture('git', ['status', '--porcelain']) ?? '').length > 0;
  const hash = capture('git', ['rev-parse', 'HEAD']);
  const message = capture('git', ['log', '-1', '--pretty=%s']);
  const branch = o.mode === 'prod' ? PRODUCTION_BRANCH : previewBranch(gitBranch, o.branch);

  if (o.mode === 'prod') {
    if (dirty) fail(['Production deploys need a clean git tree: commit or stash your changes first']);
    if (gitBranch !== PRODUCTION_BRANCH)
      fail([`Production deploys run from "${PRODUCTION_BRANCH}" (current: ${gitBranch ?? 'unknown'})`]);
  }

  if (o.quick) {
    pnpm('typecheck');
    pnpm('test');
    pnpm('lint:text');
    pnpm('build');
  } else pnpm('check'); // includes the build
  pnpm('budget');
  const dist = distProblems((p) => (existsSync(p) ? readFileSync(p, 'utf8') : null));
  if (dist.length) fail(dist);

  const target = o.mode === 'prod' ? 'PRODUCTION (terces.pages.dev)' : `preview branch "${branch}"`;
  console.log(
    `\nReady to deploy ${hash?.slice(0, 7) ?? 'uncommitted work'}${dirty ? ' (with uncommitted changes)' : ''} to ${target}.`,
  );
  if (o.mode === 'prod' && !o.yes && !(await confirm('Type "deploy" to continue: ', 'deploy')))
    fail(['Cancelled']);

  pnpm('wrangler', 'd1', 'migrations', 'apply', DATABASE, '--remote');
  pnpm(...deployArgs(branch, { hash, message, dirty }));
  console.log(
    o.mode === 'prod'
      ? '\nDeployed to production.'
      : `\nPreview deployed. Branch alias: https://${branch}.${PROJECT}.pages.dev`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.mode === 'setup') setup();
    else await deploy(o);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
