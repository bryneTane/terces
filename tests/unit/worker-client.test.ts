import { describe, expect, it, vi } from 'vitest';
import { InferenceClient, type WorkerLike } from '../../src/worker/client.ts';
import type { FromWorker, ToWorker } from '../../src/worker/protocol.ts';
import { READERS } from '../../src/worker/models/readers.ts';
import { createStages, runScan, type ScanContext, type ScanStage } from '../../src/worker/scan.ts';

function fakeWorker() {
  let handler: ((ev: MessageEvent<FromWorker>) => void) | undefined;
  const sent: { message: ToWorker; transfer?: Transferable[] }[] = [];
  const worker: WorkerLike = {
    postMessage: (message, transfer) => sent.push({ message, ...(transfer ? { transfer } : {}) }),
    addEventListener: (_t, l) => (handler = l),
    terminate: vi.fn(),
  };
  const emit = (data: FromWorker) => handler?.({ data } as MessageEvent<FromWorker>);
  return { worker, sent, emit };
}

const bitmap = {} as ImageBitmap;
const finding = {
  id: 'f',
  category: 'face',
  box: { x: 0, y: 0, w: 1, h: 1 },
  score: 1,
  source: 'yunet',
} as const;

describe('InferenceClient', () => {
  it('transfers the bitmap and forwards current-session findings', () => {
    const { worker, sent, emit } = fakeWorker();
    const client = new InferenceClient(worker);
    const got: FromWorker[] = [];
    client.subscribe((m) => got.push(m));
    client.scan('s1', bitmap, ['face']);
    expect(sent[0]).toEqual({
      message: { type: 'scan', sessionId: 's1', bitmap, categories: ['face'] },
      transfer: [bitmap],
    });
    emit({ type: 'finding', sessionId: 's1', finding });
    emit({ type: 'progress', stage: 'face', loaded: 1, total: 2 });
    expect(got.map((m) => m.type)).toEqual(['finding', 'progress']);
  });

  it('drops messages from a stale session and cancels it', () => {
    const { worker, sent, emit } = fakeWorker();
    const client = new InferenceClient(worker);
    const got: FromWorker[] = [];
    client.subscribe((m) => got.push(m));
    client.scan('old', bitmap, ['face']);
    client.scan('new', bitmap, ['face']);
    expect(sent.map((s) => s.message.type)).toEqual(['scan', 'cancel', 'scan']);
    emit({ type: 'finding', sessionId: 'old', finding });
    emit({ type: 'done', sessionId: 'old', ms: {} });
    emit({ type: 'finding', sessionId: 'new', finding });
    expect(got).toHaveLength(1);
  });

  it('forwards session-less errors (init failures)', () => {
    const { worker, emit } = fakeWorker();
    const client = new InferenceClient(worker);
    const l = vi.fn();
    client.subscribe(l);
    emit({ type: 'error', code: 'model-load', message: 'x' });
    expect(l).toHaveBeenCalledOnce();
  });
});

describe('runScan', () => {
  const ctx = (over: Partial<ScanContext> = {}): ScanContext => ({
    source: { width: 10, height: 10, pixels: vi.fn() },
    runner: () => vi.fn(),
    categories: ['face', 'text'],
    emit: vi.fn(),
    cancelled: () => false,
    ...over,
  });

  it('runs selected stages in order and reports timings', async () => {
    const order: string[] = [];
    const stages: ScanStage[] = [
      { name: 'face', category: 'face', run: async () => void order.push('face') },
      { name: 'person', category: 'person', run: async () => void order.push('person') },
      { name: 'text-det', category: 'text', run: async () => void order.push('text') },
    ];
    const ms = await runScan(ctx(), stages);
    expect(order).toEqual(['face', 'text']);
    expect(Object.keys(ms)).toEqual(['face', 'text-det']);
  });

  it('stops between stages when cancelled', async () => {
    let cancel = false;
    const stages: ScanStage[] = [
      { name: 'face', category: 'face', run: async () => void (cancel = true) },
      { name: 'text-det', category: 'text', run: vi.fn() },
    ];
    await runScan(ctx({ cancelled: () => cancel }), stages);
    expect(stages[1]!.run).not.toHaveBeenCalled();
  });
});

describe('scan stages (full order)', () => {
  it('runs faces, text det, text rec, people/vehicles, then plates; vehicles are never findings', async () => {
    const emitted: { id: string; category: string; source: string; text?: string }[] = [];
    const box = (x: number, w = 5, h = 5) => ({ x, y: 0, w, h, score: 0.9 });
    const stages = createStages({
      detectFaces: vi.fn(async () => [box(1)]),
      detectText: vi.fn(async () => [box(100, 60, 15), box(3)]),
      readTexts: vi.fn(async (_s, boxes) =>
        boxes.map((b: { x: number }) =>
          b.x === 100 ? { text: 'AB-123-CD', score: 0.9 } : { text: 'HELLO', score: 0.9 },
        ),
      ),
      detectObjects: vi.fn(async () => [
        { category: 'person' as const, label: 'person', box: { x: 0, y: 0, w: 4, h: 9 }, score: 0.8 },
        { category: 'vehicle' as const, label: 'car', box: { x: 90, y: 0, w: 200, h: 100 }, score: 0.9 },
      ]),
    });
    const runner = vi.fn(() => vi.fn());
    const ms = await runScan(
      {
        source: { width: 400, height: 400, pixels: vi.fn() },
        runner,
        dict: async () => ['A'],
        categories: ['face', 'text', 'person'],
        emit: (f) =>
          emitted.push({
            id: f.id,
            category: f.category,
            source: f.source,
            ...(f.text ? { text: f.text } : {}),
          }),
        cancelled: () => false,
      },
      stages,
    );
    expect(Object.keys(ms)).toEqual(['face', 'text-det', 'text-rec', 'person', 'plate']);
    expect(emitted).toEqual([
      { id: 'face-0', category: 'face', source: 'yunet' },
      { id: 'text-0', category: 'text', source: 'ppocr', text: 'AB-123-CD' },
      { id: 'text-1', category: 'text', source: 'ppocr', text: 'HELLO' },
      { id: 'person-0', category: 'person', source: 'yolox' },
      { id: 'text-0', category: 'plate', source: 'plate-rule', text: 'AB-123-CD' },
    ]);
    expect(runner.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      'yunet',
      'ppocr-det',
      ...READERS.map((r) => `ppocr-rec-${r.key}`),
      'yolox-nano',
    ]);
  });
});

describe('scan stages (faces then text)', () => {
  it('emits faces then text findings with stable ids and sources', async () => {
    const emitted: { id: string; category: string; source: string }[] = [];
    const box = (x: number) => ({ x, y: 0, w: 5, h: 5, score: 0.9 });
    const stages = createStages({
      detectFaces: vi.fn(async () => [box(1), box(2)]),
      detectText: vi.fn(async () => [box(3)]),
      readTexts: vi.fn(async (_s, boxes) => boxes.map(() => ({ text: 'HELLO', score: 0.9 }))),
    });
    const runner = vi.fn(() => vi.fn());
    await runScan(
      {
        source: { width: 10, height: 10, pixels: vi.fn() },
        runner,
        dict: async () => [],
        categories: ['face', 'text'],
        emit: (f) => emitted.push({ id: f.id, category: f.category, source: f.source }),
        cancelled: () => false,
      },
      stages,
    );
    expect(emitted).toEqual([
      { id: 'face-0', category: 'face', source: 'yunet' },
      { id: 'face-1', category: 'face', source: 'yunet' },
      { id: 'text-0', category: 'text', source: 'ppocr' },
    ]);
    expect(runner.mock.calls).toEqual([
      ['yunet', 'face'],
      ['ppocr-det', 'text-det'],
      ...READERS.map((r) => [`ppocr-rec-${r.key}`, 'text-rec']),
    ]);
  });
});

describe('text reading in every alphabet', () => {
  const textStages = (read: (model: string) => { text: string; score: number } | Error) =>
    createStages({
      detectText: vi.fn(async () => [{ x: 0, y: 0, w: 60, h: 20, score: 0.9 }]),
      readTexts: vi.fn(async (_s, boxes, run) => {
        const r = read((run as unknown as { model: string }).model);
        if (r instanceof Error) throw r;
        return boxes.map(() => r);
      }),
    }).filter((s) => s.name === 'text-det' || s.name === 'text-rec');
  const scan = (stages: ScanStage[]) => {
    const texts: string[] = [];
    return runScan(
      {
        source: { width: 100, height: 100, pixels: vi.fn() },
        runner: (model) => Object.assign(vi.fn(), { model }),
        dict: async () => [],
        categories: ['text'],
        emit: (f) => void (f.text && texts.push(f.text)),
        cancelled: () => false,
      },
      stages,
    ).then(() => texts);
  };

  it("names a Chinese sign in Chinese, not with the Latin reader's guess", async () => {
    const texts = await scan(
      textStages((m) =>
        m === 'ppocr-rec-zh' ? { text: '禁止吸烟', score: 0.97 } : { text: 'Wt*', score: 0.6 },
      ),
    );
    expect(texts).toEqual(['禁止吸烟']);
  });

  it('skips a reader that cannot load, and keeps the Latin reading', async () => {
    const texts = await scan(
      textStages((m) => (m === 'ppocr-rec-latin' ? { text: 'OPEN', score: 0.95 } : new Error('offline'))),
    );
    expect(texts).toEqual(['OPEN']);
  });

  it('fails the scan when the Latin reader itself cannot run', async () => {
    await expect(scan(textStages(() => new Error('broken')))).rejects.toThrow('broken');
  });

  it('marks only the text boxes that were read', async () => {
    const boxes = [
      { x: 0, y: 0, w: 2, h: 2, score: 0.97 }, // nothing read: a flower, a nose
      { x: 10, y: 0, w: 2, h: 2, score: 0.9 }, // one letter read without confidence
      { x: 20, y: 0, w: 2, h: 2, score: 0.9 }, // one digit every reader agrees on
      { x: 30, y: 0, w: 12, h: 3, score: 0.9 }, // a word
      { x: 50, y: 0, w: 30, h: 30, score: 0.9 }, // big, nothing read
    ];
    const read = (b: { x: number }, model: string) =>
      b.x === 10 && model === 'ppocr-rec-latin'
        ? { text: 'T', score: 0.55 }
        : b.x === 20
          ? { text: '7', score: 0.95 }
          : b.x === 30
            ? { text: 'OPEN', score: 0.9 }
            : { text: '', score: 0 };
    const found: string[] = [];
    await runScan(
      {
        source: { width: 100, height: 100, pixels: vi.fn() },
        runner: (model) => Object.assign(vi.fn(), { model }),
        dict: async () => [],
        categories: ['text'],
        emit: (f) => void found.push(`${f.id}:${f.text}`),
        cancelled: () => false,
      },
      createStages({
        detectText: vi.fn(async () => boxes),
        readTexts: vi.fn(async (_s, bs, run) =>
          bs.map((b: { x: number }) => read(b, (run as unknown as { model: string }).model)),
        ),
      }).filter((s) => s.name === 'text-det' || s.name === 'text-rec'),
    );
    expect(found.sort()).toEqual(['text-2:7', 'text-3:OPEN']);
  });

  it('has the Latin reader read every box, beyond the limit of the other readers', async () => {
    const boxes = Array.from({ length: 45 }, (_, i) => ({ x: i * 2, y: 0, w: 2, h: 1, score: 0.9 }));
    const sizes: Record<string, number> = {};
    await runScan(
      {
        source: { width: 100, height: 100, pixels: vi.fn() },
        runner: (model) => Object.assign(vi.fn(), { model }),
        dict: async () => [],
        categories: ['text'],
        emit: () => {},
        cancelled: () => false,
      },
      createStages({
        detectText: vi.fn(async () => boxes),
        readTexts: vi.fn(async (_s, bs, run) => {
          sizes[(run as unknown as { model: string }).model] = bs.length;
          return bs.map(() => ({ text: 'AB', score: 0.9 }));
        }),
      }).filter((s) => s.name === 'text-det' || s.name === 'text-rec'),
    );
    expect(sizes['ppocr-rec-latin']).toBe(45);
    expect(sizes['ppocr-rec-zh']).toBe(40);
  });
});
