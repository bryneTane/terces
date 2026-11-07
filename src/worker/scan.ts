// Scan pipeline: ordered stages that stream findings.
// Order: faces, text detection, text recognition (updates text findings by id), people and
// vehicles, then plate reclassification (updates). Vehicles feed the plate rule and are never
// reported as findings.
import { reclassifyPlates } from '../lib/plates.ts';
import type { Rect, VisualFinding } from '../lib/types.ts';
import type { ImageSource, Runner, Scored, TensorLike } from './models/common.ts';
import { detectFaces as yunetDetect } from './models/yunet.ts';
import { detectText as ppocrDetect, largest, recognizeText as ppocrRecognize } from './models/ppocr.ts';
import { detectObjects as yoloxDetect, type ObjectDetection } from './models/yolox.ts';
import type { ScanCategory, Stage } from './protocol.ts';

export interface ScanContext {
  source: ImageSource;
  categories: ScanCategory[];
  /** Runner for a manifest model, reporting load progress under `stage`. */
  runner: (model: string, stage: Stage) => Runner;
  /** The recognition dictionary (manifest file `ppocr-dict-latin`). */
  dict?: () => Promise<readonly string[]>;
  emit: (finding: VisualFinding) => void;
  cancelled: () => boolean;
}

/** What earlier stages found, for later stages to refine. */
export interface ScanState {
  findings: Map<string, VisualFinding>;
  vehicles: Rect[];
}

export type ScanStage = {
  name: Stage;
  category: ScanCategory;
  run: (ctx: ScanContext, state: ScanState) => Promise<void>;
};

export interface Detectors {
  detectFaces: (src: ImageSource, run: Runner, cancelled?: () => boolean) => Promise<Scored[]>;
  detectText: (src: ImageSource, run: Runner) => Promise<Scored[]>;
  recognizeText: (
    src: ImageSource,
    box: Rect,
    run: Runner,
    dict: readonly string[],
  ) => Promise<{ text: string; score: number } | null>;
  detectObjects: (src: ImageSource, run: Runner) => Promise<ObjectDetection[]>;
}

const DEFAULT_DETECTORS: Detectors = {
  detectFaces: yunetDetect,
  detectText: ppocrDetect,
  recognizeText: ppocrRecognize,
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
      run: async (ctx) => {
        const boxes = await d.detectText(ctx.source, ctx.runner('ppocr-det', 'text-det'));
        boxes.map(toFinding('text', 'ppocr', 'text')).forEach(ctx.emit);
      },
    },
    {
      name: 'text-rec',
      category: 'text',
      run: async (ctx, state) => {
        const texts = largest(textFindings(state).map((f) => ({ ...f.box, score: f.score, f })));
        if (!texts.length || !ctx.dict) return;
        const dict = await ctx.dict();
        const run = ctx.runner('ppocr-rec-latin', 'text-rec');
        for (const { f } of texts) {
          if (ctx.cancelled()) return;
          const r = await d.recognizeText(ctx.source, f.box, run, dict);
          if (r) ctx.emit({ ...f, text: r.text });
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
  const state: ScanState = { findings: new Map(), vehicles: [] };
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
