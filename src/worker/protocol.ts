// Main thread <-> inference worker messages.
import type { VisualFinding } from '../lib/types.ts';

export type Backend = 'webgpu' | 'wasm';
export type ScanCategory = 'face' | 'text' | 'person';
export type Stage = 'runtime' | 'face' | 'text-det' | 'text-rec' | 'person' | 'plate';
/** How far a stage made of several passes has got (text reading: one pass per alphabet). */
export interface StepPart {
  done: number;
  total: number;
}
export type WorkerErrorCode = 'model-load' | 'oom' | 'decode' | 'unknown';

export type ToWorker =
  | { type: 'init'; prefer: Backend }
  | { type: 'scan'; sessionId: string; bitmap: ImageBitmap; categories: ScanCategory[] }
  | { type: 'cancel'; sessionId: string };

export type FromWorker =
  | { type: 'progress'; stage: Stage; loaded: number; total: number }
  | { type: 'ready'; backend: Backend; threads: number }
  | { type: 'step'; sessionId: string; stage: Stage; part?: StepPart }
  | { type: 'finding'; sessionId: string; finding: VisualFinding }
  | { type: 'done'; sessionId: string; ms: Record<string, number> }
  | { type: 'error'; sessionId?: string; code: WorkerErrorCode; message: string };
