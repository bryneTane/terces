// Session entities. Coordinates are oriented image pixels, origin top-left.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `scanned`: the scan finished and its report is on screen, waiting for Continue. */
export type SessionState =
  'idle' | 'decoding' | 'scanning' | 'scanned' | 'reviewing' | 'cloaking' | 'result' | 'error';

export type MetadataGroup = 'location' | 'datetime' | 'device' | 'lens' | 'software' | 'identity' | 'other';

export interface MetadataFinding {
  group: MetadataGroup;
  label: string;
  value: string;
  raw: Record<string, unknown>;
  geo?: { lat: number; lon: number; place?: string };
}

export type VisualCategory = 'face' | 'text' | 'plate' | 'person';
export type FindingSource = 'yunet' | 'ppocr' | 'yolox' | 'plate-rule';

export interface VisualFinding {
  id: string;
  category: VisualCategory;
  box: Rect;
  /** 0..1 */
  score: number;
  /** Recognized string, for `text` and `plate`. */
  text?: string;
  source: FindingSource;
}

export interface Zone {
  id: string;
  /** Absent for hand-drawn zones. */
  findingId?: string;
  kind: 'detected' | 'manual';
  category: VisualCategory | 'manual';
  rect: Rect;
  /** Default true, except `person` default false. */
  selected: boolean;
}

export interface CloakSummary {
  metadataRemoved: number;
  faces: number;
  text: number;
  plates: number;
  manual: number;
}

export interface CloakResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  /** `false` disables share and download. */
  verified: boolean;
  summary: CloakSummary;
}

export interface ShareCard {
  count: number;
  breakdown: Partial<Record<VisualCategory | MetadataGroup, number>>;
  blob: Blob;
}

export type AppErrorCode = 'decode' | 'heic' | 'model-load' | 'oom' | 'verify-failed' | 'unknown';

export interface AppError {
  code: AppErrorCode;
  message?: string;
}

export interface PhotoSession {
  id: string;
  state: SessionState;
  file: File | null;
  bitmap: ImageBitmap | null;
  width: number;
  height: number;
  downscaled: boolean;
  metadata: MetadataFinding[];
  visual: VisualFinding[];
  zones: Zone[];
  result: CloakResult | null;
  error: AppError | null;
  /** Set when the scanner failed but the photo can still be cleaned by hand (manual mode). */
  notice: AppError | null;
}
