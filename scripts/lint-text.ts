import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findEmDashes, findForbiddenClaims, findKeyMismatch, type CopyIssue } from './text-rules.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p, exts);
    return exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

const files = [
  ...walk(join(root, 'src'), ['.tsx', '.json', '.html']),
  ...['README.md', 'index.html', 'lab.html', 'admin/index.html'].map((f) => join(root, f)).filter(existsSync),
];

const issues: CopyIssue[] = files.flatMap((f) => findEmDashes(relative(root, f), readFileSync(f, 'utf8')));
const en = JSON.parse(readFileSync(join(root, 'src/messages/en.json'), 'utf8')) as Record<string, string>;
const fr = JSON.parse(readFileSync(join(root, 'src/messages/fr.json'), 'utf8')) as Record<string, string>;
issues.push(
  ...findForbiddenClaims('en.json', 'en', en),
  ...findForbiddenClaims('fr.json', 'fr', fr),
  ...findKeyMismatch(en, fr),
);

if (issues.length) {
  for (const i of issues) console.error(`${i.file}:${i.line} [${i.rule}] ${i.detail}`);
  console.error(`\ntext lint: ${issues.length} issue(s)`);
  process.exit(1);
}
console.log(`text lint: ${files.length} files clean`);
