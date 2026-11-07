// Small HUD text effects: typed-out strings and a rolling counter. Instant when not animated.
import { useEffect, useRef, useState } from 'react';
import { frameLoop } from './loop.ts';

export const TYPE_MS_PER_CHAR = 18;
export const TYPE_MAX_MS = 520;
export const ROLL_MS = 600;

export function typedLength(len: number, elapsed: number): number {
  const total = Math.min(TYPE_MAX_MS, len * TYPE_MS_PER_CHAR);
  return total <= 0 ? len : Math.min(len, Math.ceil((Math.max(0, elapsed) / total) * len));
}

export function useTyped(text: string, animated: boolean, delayMs = 0): string {
  const [n, setN] = useState(animated ? 0 : text.length);
  useEffect(() => {
    if (!animated) return;
    let start: number | null = null;
    const off = frameLoop().add((now) => {
      start ??= now + delayMs;
      const k = typedLength(text.length, now - start);
      setN(k);
      if (k >= text.length) off();
    });
    return off;
  }, [text, animated, delayMs]);
  return animated ? text.slice(0, n) : text;
}

export function useRollUp(target: number, animated: boolean): number {
  const [shown, setShown] = useState(animated ? 0 : target);
  const from = useRef(shown);
  useEffect(() => {
    if (!animated) return;
    const start0 = from.current;
    let start: number | null = null;
    const off = frameLoop().add((now) => {
      start ??= now;
      const t = Math.min(1, (now - start) / ROLL_MS);
      const v = Math.round(start0 + (target - start0) * (1 - (1 - t) ** 3));
      from.current = v;
      setShown(v);
      if (t >= 1) off();
    });
    return off;
  }, [target, animated]);
  return animated ? shown : target;
}
