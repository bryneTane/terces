import { useEffect, useRef } from 'react';

type Mode = 'idle' | 'hot' | 'photo';

const HOT = 'a, button, label, input, select, textarea, [role="button"], [role="radio"]';
const RING = 28;
/** Fraction of the remaining distance the ring covers each frame: lower trails more. */
const EASE = 0.22;

/** Pure: which ring mode an element under the pointer asks for. */
export function modeFor(el: Element | null): Mode {
  if (!el) return 'idle';
  if (el.closest('[data-photo]') || el.closest('[data-compare]')) return 'photo';
  if (el.closest(HOT)) return 'hot';
  return 'idle';
}

const finePointer = () =>
  typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A soft ring that trails the normal mouse pointer (which always stays visible). It wraps
 * buttons and links when hovering them, and turns orange over a photo. Touch devices and
 * reduced motion get nothing. Animation writes to the DOM directly, never re-rendering React.
 */
export function Reticle() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || !finePointer() || reduced()) return;
    // Current and target box: x, y (top-left), w, h, radius.
    const cur = { x: -100, y: -100, w: RING, h: RING, r: RING / 2 };
    const goal = { ...cur };
    let mouse = { x: -100, y: -100 };
    let target: Element | null = null;
    let raf = 0;
    let first = true;

    const aim = () => {
      const m = modeFor(target);
      const hot = m === 'hot' ? target!.closest(HOT)! : null;
      const b = hot?.getBoundingClientRect();
      if (b && b.width < 480 && b.height < 160) {
        const pad = 5;
        Object.assign(goal, {
          x: b.left - pad,
          y: b.top - pad,
          w: b.width + pad * 2,
          h: b.height + pad * 2,
          r: 6,
        });
      } else {
        const s = m === 'photo' ? 22 : RING;
        Object.assign(goal, { x: mouse.x - s / 2, y: mouse.y - s / 2, w: s, h: s, r: s / 2 });
      }
      el.dataset.mode = b ? 'hot' : m === 'hot' ? 'idle' : m;
    };
    const frame = () => {
      aim();
      let moving = false;
      for (const k of ['x', 'y', 'w', 'h', 'r'] as const) {
        const d = goal[k] - cur[k];
        cur[k] = Math.abs(d) < 0.1 ? goal[k] : cur[k] + d * EASE;
        if (cur[k] !== goal[k]) moving = true;
      }
      el.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
      el.style.width = `${cur.w}px`;
      el.style.height = `${cur.h}px`;
      el.style.borderRadius = `${cur.r}px`;
      raf = moving ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const move = (e: MouseEvent) => {
      mouse = { x: e.clientX, y: e.clientY };
      target = e.target instanceof Element ? e.target : null;
      if (first) {
        first = false;
        aim();
        Object.assign(cur, goal);
      }
      el.style.opacity = '1';
      kick();
    };
    const leave = () => {
      el.style.opacity = '0';
    };
    addEventListener('mousemove', move, { passive: true });
    addEventListener('scroll', kick, { passive: true });
    document.addEventListener('mouseleave', leave);
    addEventListener('blur', leave);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('mousemove', move);
      removeEventListener('scroll', kick);
      document.removeEventListener('mouseleave', leave);
      removeEventListener('blur', leave);
    };
  }, []);

  return (
    <div
      ref={root}
      aria-hidden="true"
      data-testid="cursor"
      data-mode="idle"
      className="cursor-ring pointer-events-none fixed top-0 left-0 z-[100] opacity-0"
    />
  );
}
