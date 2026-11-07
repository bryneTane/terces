// Rules for the text users see: no em-dashes, no safety claims, EN/FR parity. Pure functions, tested in tests/unit/lint-text.test.ts.

export interface CopyIssue {
  file: string;
  line: number;
  rule: 'em-dash' | 'forbidden-claim' | 'key-parity';
  detail: string;
}

const EM_DASH = '—';
const FORBIDDEN: Record<'en' | 'fr', RegExp> = {
  en: /\b(safe|safely|secure|secured|anonymous|anonymized|protected)\b/i,
  fr: /(?<![\p{L}])(sûr|sûre|sécurisée?s?|anonymes?|anonymisée?s?|protégée?s?)(?![\p{L}])/iu,
};

export function findEmDashes(file: string, text: string): CopyIssue[] {
  const issues: CopyIssue[] = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes(EM_DASH)) issues.push({ file, line: i + 1, rule: 'em-dash', detail: line.trim() });
  });
  return issues;
}

export function findForbiddenClaims(
  file: string,
  locale: 'en' | 'fr',
  messages: Record<string, string>,
): CopyIssue[] {
  return Object.entries(messages)
    .filter(([, v]) => FORBIDDEN[locale].test(v))
    .map(([k, v]) => ({ file, line: 0, rule: 'forbidden-claim' as const, detail: `${k}: ${v}` }));
}

export function findKeyMismatch(en: Record<string, string>, fr: Record<string, string>): CopyIssue[] {
  const issues: CopyIssue[] = [];
  for (const k of Object.keys(en))
    if (!(k in fr)) issues.push({ file: 'fr.json', line: 0, rule: 'key-parity', detail: `missing ${k}` });
  for (const k of Object.keys(fr))
    if (!(k in en)) issues.push({ file: 'en.json', line: 0, rule: 'key-parity', detail: `missing ${k}` });
  return issues;
}
