import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBackGuard } from '../../src/lib/backGuard.ts';

const back = () => {
  // jsdom does not navigate: land below the guard the way the browser would, then tell the page.
  history.replaceState(null, '', location.href);
  dispatchEvent(new PopStateEvent('popstate', { state: null }));
};

afterEach(() => history.replaceState(null, '', '/'));

describe('useBackGuard', () => {
  it('puts a guard on top of the history while a photo is open, and again after back', () => {
    const before = history.length;
    const { unmount } = renderHook(() => useBackGuard(true));
    expect(history.length).toBe(before + 1);
    expect(history.state).toEqual({ 'terces-guard': true });
    back();
    expect(history.state).toEqual({ 'terces-guard': true });
    unmount();
  });

  it('does nothing without a photo', () => {
    const before = history.length;
    renderHook(() => useBackGuard(false));
    expect(history.length).toBe(before);
    back();
    expect(history.state).toBeNull();
  });

  it('leaves hash pages alone, going to them and back from them', () => {
    renderHook(() => useBackGuard(true));
    const length = history.length;
    // Opening #about adds an entry (popstate, no state, another address): no guard on top of it.
    history.pushState(null, '', '#about');
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(history.length).toBe(length + 1);
    // Back from #about lands on the guard itself: nothing to put back.
    dispatchEvent(new PopStateEvent('popstate', { state: { 'terces-guard': true } }));
    expect(history.length).toBe(length + 1);
  });

  it('asks before the page unloads with a photo open', () => {
    renderHook(() => useBackGuard(true));
    const e = new Event('beforeunload', { cancelable: true });
    dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
