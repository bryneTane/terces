import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuality } from '../fx/QualityProvider.tsx';

export const GLITCH_MIN_MS = 250;
export const GLITCH_MAX_MS = 400;
export const glitchDuration = (random: () => number = Math.random) =>
  Math.round(GLITCH_MIN_MS + random() * (GLITCH_MAX_MS - GLITCH_MIN_MS));

/**
 * Plays a short glitch when `screen` changes, then moves focus to the new screen's heading so
 * screen readers and keyboards follow. The static tier swaps instantly.
 */
export function GlitchTransition({ screen, children }: { screen: string; children: ReactNode }) {
  const { tier } = useQuality();
  const box = useRef<HTMLDivElement>(null);
  const [prev, setPrev] = useState(screen);
  const [ms, setMs] = useState<number | null>(null);
  // Derived from the screen change, during render (no effect round-trip).
  if (screen !== prev) {
    setPrev(screen);
    setMs(tier === 'static' ? null : glitchDuration());
  }

  useEffect(() => {
    if (ms === null) return;
    const t = setTimeout(() => setMs(null), ms);
    return () => clearTimeout(t);
  }, [ms]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Each screen owns its <h1> (with tabIndex={-1}); this wrapper only moves focus to it, so
    // keyboard and screen reader users land on the new screen. Scoped to this component's node.
    box.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [screen]);

  return (
    <div
      ref={box}
      key={screen}
      data-testid="screen"
      data-glitch={ms ?? undefined}
      className={`flex flex-1 flex-col ${ms ? 'glitch-in' : ''}`}
      style={ms ? ({ '--glitch-ms': `${ms}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
