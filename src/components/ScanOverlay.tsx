import { useEffect, useLayoutEffect, useRef } from 'react';
import { frameLoop } from '../fx/loop.ts';
import { useQuality } from '../fx/QualityProvider.tsx';
import { SeenClock, reticleAt } from '../fx/reticles.ts';
import { ScanRenderer } from '../fx/scanRenderer.ts';
import type { Rect, VisualFinding } from '../lib/types.ts';

export const SWEEP_MS = 2400;

/** Corner-bracket path, for the static tier. */
export function bracketPath(r: Rect, k = 0.24): string {
  const a = Math.min(r.w, r.h) * k;
  const { x, y, w, h } = r;
  return `M${x},${y + a}V${y}H${x + a}M${x + w - a},${y}H${x + w}V${y + a}M${x + w},${y + h - a}V${y + h}H${x + w - a}M${x + a},${y + h}H${x}V${y + h - a}`;
}

/**
 * The scan layer over the photo: beam and lock-on reticles (WebGL), or plain outlines on the
 * static tier. It only receives finding boxes, never the photo, and nothing reads it back.
 */
export function ScanOverlay({
  findings,
  width,
  height,
  active,
}: {
  findings: VisualFinding[];
  width: number;
  height: number;
  active: boolean;
}) {
  const { tier, governor } = useQuality();
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ findings, width, height, active, tier });
  useLayoutEffect(() => {
    latest.current = { findings, width, height, active, tier };
  });

  useEffect(() => {
    governor.setInferring(active);
    return () => governor.setInferring(false);
  }, [active, governor]);

  const animated = tier !== 'static';
  // The canvas only exists once the photo size is known, so the renderer waits for it.
  const sized = width > 0 && height > 0;
  useEffect(() => {
    if (!animated || !sized || !canvas.current) return;
    const renderer = ScanRenderer.create(canvas.current);
    if (!renderer) return;
    const clock = new SeenClock();
    const start = performance.now();
    const off = frameLoop().add((now, dt) => {
      const s = latest.current;
      clock.mark(
        s.findings.map((f) => f.id),
        now,
      );
      const reticles = s.findings.map((f) =>
        reticleAt(f.id, f.box, clock.at(f.id) ?? now, now, f.category !== 'person'),
      );
      const beam = s.active ? ((now - start) % SWEEP_MS) / SWEEP_MS : -1;
      renderer.draw(now, beam, reticles, s.width, s.height, s.tier);
      governor.frame(now, dt);
    });
    return () => {
      off();
      renderer.dispose();
    };
  }, [animated, sized, governor]);

  if (!width || !height) return null;
  return (
    <div className="absolute inset-0" aria-hidden="true" data-testid="scan-overlay" data-tier={tier}>
      {animated ? (
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {findings.map((f) => (
            <path
              key={f.id}
              data-testid="reticle"
              d={bracketPath(f.box)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              className={f.category === 'person' ? 'stroke-accent' : 'stroke-alert'}
            />
          ))}
        </svg>
      )}
    </div>
  );
}
