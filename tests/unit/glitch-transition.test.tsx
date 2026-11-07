import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  GLITCH_MAX_MS,
  GLITCH_MIN_MS,
  GlitchTransition,
  glitchDuration,
} from '../../src/components/GlitchTransition.tsx';
import { QualityProvider } from '../../src/fx/QualityProvider.tsx';
import type { Tier } from '../../src/fx/quality.ts';

const view = (tier: Tier, name: string) => (
  <QualityProvider forceTier={tier}>
    <GlitchTransition screen={name}>
      <h1>{name}</h1>
    </GlitchTransition>
  </QualityProvider>
);

describe('GlitchTransition', () => {
  it('lasts 250 to 400 ms', () => {
    expect(glitchDuration(() => 0)).toBe(GLITCH_MIN_MS);
    expect(glitchDuration(() => 1)).toBe(GLITCH_MAX_MS);
    expect(GLITCH_MIN_MS).toBe(250);
    expect(GLITCH_MAX_MS).toBe(400);
  });

  it('glitches on a screen change, not on first render, then settles', () => {
    vi.useFakeTimers();
    const { rerender } = render(view('high', 'Scanning'));
    expect(screen.getByTestId('screen')).not.toHaveClass('glitch-in');
    rerender(view('high', 'Review'));
    expect(screen.getByTestId('screen')).toHaveClass('glitch-in');
    act(() => void vi.advanceTimersByTime(GLITCH_MAX_MS));
    expect(screen.getByTestId('screen')).not.toHaveClass('glitch-in');
    vi.useRealTimers();
  });

  it('swaps instantly on the static tier and moves focus to the new heading', () => {
    const { rerender } = render(view('static', 'Scanning'));
    rerender(view('static', 'Review'));
    expect(screen.getByTestId('screen')).not.toHaveClass('glitch-in');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Review' }));
  });
});
