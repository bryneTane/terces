import { useEffect, useRef } from 'react';
import { createGl } from '../fx/gl.ts';
import { frameLoop } from '../fx/loop.ts';
import { useQuality } from '../fx/QualityProvider.tsx';
import { FIELD_FS } from '../fx/shaders/field.ts';
import { ICE, rgb } from '../styles/palette.ts';

const TIER = { high: 0, medium: 1, low: 2, static: 3 } as const;

/** Animated grid behind the landing page; a static CSS grid on the static tier. Decorative only. */
export function FieldBackground() {
  const { tier, governor } = useQuality();
  const canvas = useRef<HTMLCanvasElement>(null);
  const tierRef = useRef(tier);
  useEffect(() => {
    tierRef.current = tier;
  }, [tier]);
  const animated = tier !== 'static';

  useEffect(() => {
    const c = canvas.current;
    if (!animated || !c) return;
    const h = createGl(c);
    if (!h) return;
    const prog = h.program('field', FIELD_FS);
    const { gl } = h;
    const touch = { x: -1e4, y: -1e4, at: -1e4 };
    const onDown = (e: PointerEvent) => {
      const dpr = c.width / Math.max(1, c.clientWidth);
      touch.x = e.clientX * dpr;
      touch.y = e.clientY * dpr;
      touch.at = performance.now();
    };
    addEventListener('pointerdown', onDown, { passive: true });
    const off = frameLoop().add((now, dt) => {
      h.resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), now / 1000);
      gl.uniform3f(gl.getUniformLocation(prog, 'u_touch'), touch.x, touch.y, (now - touch.at) / 1000);
      gl.uniform3f(gl.getUniformLocation(prog, 'u_accent'), ...rgb(ICE.accent));
      gl.uniform1i(gl.getUniformLocation(prog, 'u_tier'), TIER[tierRef.current]);
      h.drawQuad(prog);
      governor.frame(now, dt);
    });
    return () => {
      off();
      removeEventListener('pointerdown', onDown);
      h.dispose();
    };
  }, [animated, governor]);

  return (
    <div
      aria-hidden="true"
      data-testid="field"
      data-tier={tier}
      className="pointer-events-none fixed inset-0 -z-10"
    >
      {animated ? (
        <canvas ref={canvas} className="h-full w-full" />
      ) : (
        <div className="ice-grid h-full w-full" />
      )}
    </div>
  );
}
