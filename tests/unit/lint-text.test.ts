import { describe, expect, it } from 'vitest';
import { findEmDashes, findForbiddenClaims, findKeyMismatch } from '../../scripts/text-rules.ts';

describe('copy rules', () => {
  it('flags em-dashes with line numbers', () => {
    const issues = findEmDashes('a.tsx', 'ok line\nbad — line\nfine - hyphen');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.line).toBe(2);
  });

  it('flags forbidden claims in English', () => {
    expect(findForbiddenClaims('en', 'en', { a: 'Your photo is safe now' })).toHaveLength(1);
    expect(findForbiddenClaims('en', 'en', { a: 'Fully protected' })).toHaveLength(1);
    expect(findForbiddenClaims('en', 'en', { a: 'Here is what we found' })).toHaveLength(0);
    expect(findForbiddenClaims('en', 'en', { a: 'unsafe-looking text' })).toHaveLength(0);
  });

  it('flags forbidden claims in French', () => {
    expect(findForbiddenClaims('fr', 'fr', { a: 'Votre photo est sécurisée' })).toHaveLength(1);
    expect(findForbiddenClaims('fr', 'fr', { a: 'Vous êtes anonyme' })).toHaveLength(1);
    expect(findForbiddenClaims('fr', 'fr', { a: 'Voici ce que nous avons trouvé' })).toHaveLength(0);
  });

  it('flags key mismatches both ways', () => {
    const issues = findKeyMismatch({ a: '1', b: '2' }, { a: '1', c: '3' });
    expect(issues.map((i) => i.detail).sort()).toEqual(['missing b', 'missing c']);
  });
});
