import { describe, expect, it } from 'vitest';
import { modeFor } from '../../src/components/Reticle.tsx';

describe('cursor ring mode', () => {
  it('wraps controls, turns orange over photos, idles elsewhere', () => {
    document.body.innerHTML =
      '<p id="p">x</p><button id="b">go</button><div data-photo><img id="i"></div><div data-compare><input id="r"></div>';
    const $ = (id: string) => document.getElementById(id);
    expect(modeFor($('p'))).toBe('idle');
    expect(modeFor($('b'))).toBe('hot');
    expect(modeFor($('i'))).toBe('photo');
    expect(modeFor($('r'))).toBe('photo');
    expect(modeFor(null)).toBe('idle');
  });
});
