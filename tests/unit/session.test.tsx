import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { initialSession, sessionReducer, type SessionAction } from '../../src/state/session.ts';
import { SessionProvider, useSession } from '../../src/state/SessionProvider.tsx';
import type { CloakResult, PhotoSession, VisualFinding } from '../../src/lib/types.ts';

const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
const fakeBitmap = () => ({ width: 10, height: 8, close: vi.fn() }) as unknown as ImageBitmap;
const finding = (id: string, text?: string): VisualFinding => ({
  id,
  category: 'text',
  box: { x: 0, y: 0, w: 1, h: 1 },
  score: 0.9,
  source: 'ppocr',
  ...(text ? { text } : {}),
});
const result = (url = 'blob:r'): CloakResult => ({
  blob: new Blob(),
  url,
  width: 10,
  height: 8,
  verified: true,
  summary: { metadataRemoved: 1, faces: 0, text: 1, plates: 0, manual: 0 },
});

function run(actions: SessionAction[], start: PhotoSession = initialSession) {
  return actions.reduce(sessionReducer, start);
}

const toReviewing: SessionAction[] = [
  { type: 'pick', id: 's1', file },
  { type: 'decoded', id: 's1', bitmap: fakeBitmap(), width: 10, height: 8, downscaled: false },
  { type: 'scanDone', id: 's1' },
  { type: 'continue', id: 's1' },
];

describe('session reducer', () => {
  it('walks the happy path', () => {
    let s = run([{ type: 'pick', id: 's1', file }]);
    expect(s.state).toBe('decoding');
    s = run([{ type: 'decoded', id: 's1', bitmap: fakeBitmap(), width: 10, height: 8, downscaled: true }], s);
    expect(s).toMatchObject({ state: 'scanning', width: 10, downscaled: true });
    s = run([{ type: 'scanDone', id: 's1' }], s);
    expect(s.state).toBe('scanned');
    s = run([{ type: 'cloakStart', id: 's1' }], s);
    expect(s.state).toBe('scanned'); // the report must be dismissed first
    s = run([{ type: 'continue', id: 's1' }], s);
    expect(s.state).toBe('reviewing');
    s = run([{ type: 'cloakStart', id: 's1' }], s);
    expect(s.state).toBe('cloaking');
    s = run([{ type: 'cloakDone', id: 's1', result: result() }], s);
    expect(s.state).toBe('result');
    s = run([{ type: 'editZones', id: 's1' }], s);
    expect(s).toMatchObject({ state: 'reviewing', result: null });
  });

  it('keeps metadata when a scan is cancelled', () => {
    const s = run([
      { type: 'pick', id: 's1', file },
      { type: 'metadata', id: 's1', metadata: [{ group: 'device', label: 'Device', value: 'X', raw: {} }] },
      { type: 'decoded', id: 's1', bitmap: fakeBitmap(), width: 1, height: 1, downscaled: false },
      { type: 'scanCancel', id: 's1' },
    ]);
    expect(s.state).toBe('reviewing');
    expect(s.metadata).toHaveLength(1);
  });

  it('streams findings and updates them by id', () => {
    const s = run([
      ...toReviewing.slice(0, 2),
      { type: 'finding', id: 's1', finding: finding('a') },
      { type: 'finding', id: 's1', finding: finding('b') },
      { type: 'finding', id: 's1', finding: finding('a', 'RUE') },
    ]);
    expect(s.visual.map((f) => f.id)).toEqual(['a', 'b']);
    expect(s.visual[0]?.text).toBe('RUE');
  });

  it('skip works from the finished report too', () => {
    const s = run([...toReviewing.slice(0, 3), { type: 'scanCancel', id: 's1' }]);
    expect(s.state).toBe('reviewing');
  });

  it('builds zones from every finding when the scan ends', () => {
    const face = { ...finding('f'), category: 'face' as const, box: { x: 0, y: 0, w: 2, h: 2 } };
    const s = run([
      ...toReviewing.slice(0, 2),
      { type: 'finding', id: 's1', finding: face },
      { type: 'scanDone', id: 's1' },
    ]);
    expect(s.zones.map((z) => z.findingId)).toEqual(['f']);
  });

  it('ignores actions for a stale session', () => {
    const s = run([
      { type: 'pick', id: 'old', file },
      { type: 'pick', id: 'new', file },
      { type: 'decoded', id: 'old', bitmap: fakeBitmap(), width: 1, height: 1, downscaled: false },
      { type: 'finding', id: 'old', finding: finding('x') },
    ]);
    expect(s).toMatchObject({ id: 'new', state: 'decoding', visual: [] });
  });

  it('moves to error from active states and resets to idle', () => {
    const s = run([
      { type: 'pick', id: 's1', file },
      { type: 'fail', id: 's1', error: { code: 'decode' } },
    ]);
    expect(s).toMatchObject({ state: 'error', error: { code: 'decode' } });
    expect(run([{ type: 'reset' }], s)).toBe(initialSession);
  });

  it('rejects out-of-order transitions', () => {
    const s = run([
      { type: 'pick', id: 's1', file },
      { type: 'cloakStart', id: 's1' },
    ]);
    expect(s.state).toBe('decoding');
  });
});

describe('SessionProvider resource release', () => {
  it('closes the bitmap and revokes the result URL on reset', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const bitmap = fakeBitmap();
    let api!: ReturnType<typeof useSession>;
    function Probe() {
      api = useSession();
      return null;
    }
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    act(() => {
      api.dispatch({ type: 'pick', id: 's1', file });
      api.dispatch({ type: 'decoded', id: 's1', bitmap, width: 1, height: 1, downscaled: false });
      api.dispatch({ type: 'scanDone', id: 's1' });
      api.dispatch({ type: 'continue', id: 's1' });
      api.dispatch({ type: 'cloakStart', id: 's1' });
      api.dispatch({ type: 'cloakDone', id: 's1', result: result('blob:abc') });
    });
    expect(bitmap.close).not.toHaveBeenCalled();
    act(() => api.dispatch({ type: 'reset' }));
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:abc');
    revoke.mockRestore();
  });
});

describe('usage ticks', () => {
  function mount() {
    const onUsage = vi.fn();
    let api!: ReturnType<typeof useSession>;
    function Probe() {
      api = useSession();
      return null;
    }
    render(
      <SessionProvider onUsage={onUsage}>
        <Probe />
      </SessionProvider>,
    );
    return { onUsage, d: (a: SessionAction) => act(() => api.dispatch(a)) };
  }
  const toCloaking = (d: (a: SessionAction) => void, id: string) => {
    d({ type: 'pick', id, file });
    d({ type: 'decoded', id, bitmap: fakeBitmap(), width: 10, height: 8, downscaled: false });
    d({ type: 'scanDone', id });
    d({ type: 'continue', id });
    d({ type: 'cloakStart', id });
  };

  it('counts one scan per photo and a cloak only when verified', () => {
    const { onUsage, d } = mount();
    toCloaking(d, 's1');
    d({ type: 'finding', id: 's1', finding: finding('f') });
    d({ type: 'cloakDone', id: 's1', result: { ...result(), verified: false } });
    expect(onUsage.mock.calls).toEqual([['scan']]);
    toCloaking(d, 's2');
    d({ type: 'cloakDone', id: 's2', result: result() });
    expect(onUsage.mock.calls).toEqual([['scan'], ['scan'], ['cloak']]);
  });

  it('counts a re-cloak after editing zones again', () => {
    const { onUsage, d } = mount();
    toCloaking(d, 's1');
    d({ type: 'cloakDone', id: 's1', result: result() });
    d({ type: 'editZones', id: 's1' });
    d({ type: 'cloakStart', id: 's1' });
    d({ type: 'cloakDone', id: 's1', result: result() });
    expect(onUsage.mock.calls).toEqual([['scan'], ['cloak'], ['cloak']]);
  });
});

describe('manual mode when the scanner fails', () => {
  const err = { code: 'model-load' as const, message: 'x' };

  it('a scan failure goes to review with metadata and findings kept, and a notice', () => {
    const s = run([
      { type: 'pick', id: 's1', file },
      {
        type: 'metadata',
        id: 's1',
        metadata: [{ group: 'device', label: 'meta.device', value: 'X', raw: {} }],
      },
      { type: 'decoded', id: 's1', bitmap: fakeBitmap(), width: 10, height: 8, downscaled: false },
      { type: 'finding', id: 's1', finding: finding('f1') },
      { type: 'scanFailed', id: 's1', error: err },
    ]);
    expect(s.state).toBe('reviewing');
    expect(s.metadata).toHaveLength(1);
    expect(s.zones).toHaveLength(1);
    expect(s.notice).toEqual(err);
  });

  it('a failure known before decoding ends skips scanning entirely', () => {
    const s = run([
      { type: 'pick', id: 's1', file },
      { type: 'scanFailed', id: 's1', error: err },
      { type: 'decoded', id: 's1', bitmap: fakeBitmap(), width: 10, height: 8, downscaled: false },
    ]);
    expect(s.state).toBe('reviewing');
    expect(s.notice).toEqual(err);
  });

  it('a new photo clears the notice', () => {
    const s = run([
      { type: 'pick', id: 's1', file },
      { type: 'scanFailed', id: 's1', error: err },
      { type: 'pick', id: 's2', file },
    ]);
    expect(s.notice).toBeNull();
  });
});
