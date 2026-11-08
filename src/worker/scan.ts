// Scan pipeline: ordered stages that stream findings.
// Order: faces, text detection, text reading in every alphabet (which sends the text that was
// read, named by what it says), people and vehicles, then plate reclassification (updates). Vehicles feed the plate rule and are never
// reported as findings.
import { reclassifyPlates } from '../lib/plates.ts';
import type { Rect, VisualFinding } from '../lib/types.ts';
import type { ImageSource, Runner, Scored, TensorLike } from './models/common.ts';
import { detectFaces as yunetDetect } from './models/yunet.ts';
import { detectText as ppocrDetect, largest, readTexts as ppocrRead } from './models/ppocr.ts';
import { detectObjects as yoloxDetect, type ObjectDetection } from './models/yolox.ts';
import { bestReading, isRead, READERS, type Reading } from './models/readers.ts';
import type { ScanCategory, Stage } from './protocol.ts';

export interface ScanContext {
  source: ImageSource;
  categories: ScanCategory[];
  /** Runner for a manifest model, reporting load progress under `stage`. */
  runner: (model: string, stage: Stage) => Runner;
  /** A reader's dictionary by manifest name (`ppocr-dict-<alphabet>`). */
  dict?: (name: string) => Promise<readonly string[]>;
  emit: (finding: VisualFinding) => void;
  cancelled: () => boolean;
}

/** What earlier stages found, for later stages to refine. */
export interface ScanState {
  findings: Map<string, VisualFinding>;
  vehicles: Rect[];
  /** Text boxes found by detection, waiting to be read: only the ones read become findings. */
  pendingText: VisualFinding[];
}

export type ScanStage = {
  name: Stage;
  category: ScanCategory;
  run: (ctx: ScanContext, state: ScanState) => Promise<void>;
};

export interface Detectors {
  detectFaces: (src: ImageSource, run: Runner, cancelled?: () => boolean) => Promise<Scored[]>;
  detectText: (src: ImageSource, run: Runner) => Promise<Scored[]>;
  /** One reader's readings of many boxes, same order, null for unreadable boxes. */
  readTexts: (
    src: ImageSource,
    boxes: Rect[],
    run: Runner,
    dict: readonly string[],
  ) => Promise<({ text: string; score: number } | null)[]>;
  detectObjects: (src: ImageSource, run: Runner) => Promise<ObjectDetection[]>;
}

const DEFAULT_DETECTORS: Detectors = {
  detectFaces: yunetDetect,
  detectText: ppocrDetect,
  readTexts: ppocrRead,
  detectObjects: yoloxDetect,
};

const toFinding =
  (category: VisualFinding['category'], source: VisualFinding['source'], prefix: string) =>
  (b: Scored, i: number): VisualFinding => ({
    id: `${prefix}-${i}`,
    category,
    box: { x: b.x, y: b.y, w: b.w, h: b.h },
    score: b.score,
    source,
  });

const textFindings = (s: ScanState) => [...s.findings.values()].filter((f) => f.category === 'text');

export function createStages(partial: Partial<Detectors> = {}): ScanStage[] {
  const d = { ...DEFAULT_DETECTORS, ...partial };
  return [
    {
      name: 'face',
      category: 'face',
      run: async (ctx) => {
        const boxes = await d.detectFaces(ctx.source, ctx.runner('yunet', 'face'), ctx.cancelled);
        boxes.map(toFinding('face', 'yunet', 'face')).forEach(ctx.emit);
      },
    },
    {
      name: 'text-det',
      category: 'text',
      run: async (ctx, state) => {
        const boxes = await d.detectText(ctx.source, ctx.runner('ppocr-det', 'text-det'));
        state.pendingText = boxes.map(toFinding('text', 'ppocr', 'text'));
      },
    },
    {
      name: 'text-rec',
      category: 'text',
      // Every reader reads every box, then one reading per box is chosen (readers.ts). Only boxes
      // that were read are marked: the detector also fires on flowers and faces. Readers other
      // than Latin are downloaded the first time; one that cannot load (offline before that) is
      // skipped. The Latin reader reads every box; the others, the largest ones (time).
      run: async (ctx, state) => {
        const found = state.pendingText;
        if (!found.length || !ctx.dict) return;
        const largestOnes = largest(found.map((f) => ({ ...f.box, f }))).map(({ f }) => f);
        const reads = new Map<string, Map<string, Reading>>();
        for (const reader of READERS) {
          try {
            const dict = await ctx.dict(`ppocr-dict-${reader.key}`);
            const run = ctx.runner(`ppocr-rec-${reader.key}`, 'text-rec');
            if (ctx.cancelled()) return;
            const texts = reader.key === 'latin' ? found : largestOnes;
            const rs = await d.readTexts(
              ctx.source,
              texts.map((f) => f.box),
              run,
              dict,
            );
            texts.forEach((f, i) => {
              const r = rs[i];
              if (r) reads.set(f.id, (reads.get(f.id) ?? new Map()).set(reader.key, r));
            });
          } catch (e) {
            if (reader.key === 'latin') throw e;
          }
        }
        state.pendingText = [];
        for (const f of found) {
          const r = bestReading(reads.get(f.id) ?? new Map());
          if (isRead(r)) ctx.emit({ ...f, text: r.text });
        }
      },
    },
    {
      name: 'person',
      category: 'person',
      run: async (ctx, state) => {
        const objects = await d.detectObjects(ctx.source, ctx.runner('yolox-nano', 'person'));
        let n = 0;
        for (const o of objects) {
          if (o.category === 'vehicle') state.vehicles.push(o.box);
          else
            ctx.emit({
              id: `person-${n++}`,
              category: 'person',
              box: o.box,
              score: o.score,
              source: 'yolox',
            });
        }
      },
    },
    {
      name: 'plate',
      category: 'text',
      run: async (ctx, state) => {
        reclassifyPlates(textFindings(state), state.vehicles).forEach(ctx.emit);
      },
    },
  ];
}

/** Runs the stages in order, stopping between stages when cancelled. Returns per-stage ms. */
export async function runScan(
  ctx: ScanContext,
  stages: ScanStage[] = createStages(),
): Promise<Record<string, number>> {
  const ms: Record<string, number> = {};
  const state: ScanState = { findings: new Map(), vehicles: [], pendingText: [] };
  const tracked: ScanContext = {
    ...ctx,
    emit: (f) => {
      state.findings.set(f.id, f);
      ctx.emit(f);
    },
  };
  for (const stage of stages) {
    if (ctx.cancelled()) break;
    if (!ctx.categories.includes(stage.category)) continue;
    const t0 = performance.now();
    await stage.run(tracked, state);
    ms[stage.name] = Math.round(performance.now() - t0);
  }
  return ms;
}

export type { TensorLike };
