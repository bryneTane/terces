import { expect, it, vi } from 'vitest';
import { FrameLoop, type LoopDeps } from '../../src/fx/loop.ts';

function deps() {
  const queue = new Map<number, FrameRequestCallback>();
  let id = 0;
  const listeners: (() => void)[] = [];
  const doc = {
    hidden: false,
    addEventListener: (_: string, l: () => void) => listeners.push(l),
    removeEventListener: vi.fn(),
  };
  const d: LoopDeps = {
    raf: (cb) => (queue.set(++id, cb), id),
    caf: (i) => void queue.delete(i),
    doc: doc as unknown as LoopDeps['doc'],
  };
  const step = (t: number) => {
    const cbs = [...queue.values()];
    queue.clear();
    cbs.forEach((cb) => cb(t));
  };
  const setHidden = (h: boolean) => ((doc.hidden = h), listeners.forEach((l) => l()));
  return { d, step, setHidden, pending: () => queue.size };
}

it('runs every subscriber once per frame with the frame delta', () => {
  const { d, step } = deps();
  const loop = new FrameLoop(d);
  const a = vi.fn();
  const b = vi.fn();
  loop.add(a);
  loop.add(b);
  step(100);
  step(116);
  expect(a).toHaveBeenCalledTimes(2);
  expect(b.mock.calls[1]).toEqual([116, 16]);
});

it('stops when the last subscriber leaves', () => {
  const { d, step, pending } = deps();
  const loop = new FrameLoop(d);
  const off = loop.add(vi.fn());
  step(0);
  off();
  expect(loop.running).toBe(false);
  expect(pending()).toBe(0);
});

it('pauses while hidden and resumes when visible', () => {
  const { d, step, setHidden, pending } = deps();
  const loop = new FrameLoop(d);
  const fn = vi.fn();
  loop.add(fn);
  setHidden(true);
  expect(pending()).toBe(0);
  step(10);
  expect(fn).not.toHaveBeenCalled();
  setHidden(false);
  step(20);
  expect(fn).toHaveBeenCalledTimes(1);
});
