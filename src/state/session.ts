import { findingsToZones } from '../lib/zones.ts';
import type {
  AppError,
  CloakResult,
  MetadataFinding,
  PhotoSession,
  VisualFinding,
  Zone,
} from '../lib/types.ts';

export type SessionAction =
  | { type: 'pick'; id: string; file: File }
  | { type: 'decoded'; id: string; bitmap: ImageBitmap; width: number; height: number; downscaled: boolean }
  | { type: 'metadata'; id: string; metadata: MetadataFinding[] }
  | { type: 'finding'; id: string; finding: VisualFinding }
  | { type: 'zones'; id: string; zones: Zone[] }
  | { type: 'scanDone'; id: string }
  | { type: 'scanCancel'; id: string }
  | { type: 'scanFailed'; id: string; error: AppError }
  | { type: 'continue'; id: string }
  | { type: 'cloakStart'; id: string }
  | { type: 'cloakDone'; id: string; result: CloakResult }
  | { type: 'editZones'; id: string }
  | { type: 'fail'; id: string; error: AppError }
  | { type: 'reset' };

export const initialSession: PhotoSession = {
  id: '',
  state: 'idle',
  file: null,
  bitmap: null,
  width: 0,
  height: 0,
  downscaled: false,
  metadata: [],
  visual: [],
  zones: [],
  result: null,
  error: null,
  notice: null,
};

/**
 * Pure session state machine:
 * idle -> decoding -> scanning -> scanned -> reviewing -> cloaking -> result; decoding/scanning/cloaking -> error;
 * scanning -> reviewing on cancel (metadata kept); result -> reviewing; any -> idle on reset.
 * Actions for another session id are ignored (stale worker results). Resource release
 * (ImageBitmap.close, URL.revokeObjectURL) happens in SessionProvider when references change.
 */
export function sessionReducer(s: PhotoSession, a: SessionAction): PhotoSession {
  if (a.type === 'reset') return initialSession;
  if (a.type === 'pick') return { ...initialSession, id: a.id, state: 'decoding', file: a.file };
  if (a.id !== s.id) return s;

  switch (a.type) {
    case 'decoded':
      if (s.state !== 'decoding') return s;
      if (s.notice)
        return {
          ...s,
          state: 'reviewing',
          bitmap: a.bitmap,
          width: a.width,
          height: a.height,
          downscaled: a.downscaled,
        };
      return {
        ...s,
        state: 'scanning',
        bitmap: a.bitmap,
        width: a.width,
        height: a.height,
        downscaled: a.downscaled,
      };
    case 'metadata':
      return s.state === 'idle' ? s : { ...s, metadata: a.metadata };
    case 'finding': {
      if (s.state !== 'scanning' && s.state !== 'scanned' && s.state !== 'reviewing') return s;
      const i = s.visual.findIndex((f) => f.id === a.finding.id);
      const visual = i === -1 ? [...s.visual, a.finding] : s.visual.map((f, j) => (j === i ? a.finding : f));
      return { ...s, visual };
    }
    case 'zones':
      return s.state === 'scanning' || s.state === 'reviewing' ? { ...s, zones: a.zones } : s;
    // Zones are built here, from the reducer's own findings, so no late finding is left unmasked.
    case 'scanDone':
      // The report stays on screen until the user continues.
      return s.state === 'scanning'
        ? { ...s, state: 'scanned', zones: findingsToZones(s.visual, s.width, s.height) }
        : s;
    case 'scanCancel':
      return s.state === 'scanning' || s.state === 'scanned'
        ? { ...s, state: 'reviewing', zones: findingsToZones(s.visual, s.width, s.height) }
        : s;
    case 'continue':
      return s.state === 'scanned'
        ? { ...s, state: 'reviewing', zones: findingsToZones(s.visual, s.width, s.height) }
        : s;
    case 'scanFailed':
      // Manual mode: keep metadata and whatever was found, explain, let the user draw.
      if (s.state === 'decoding') return { ...s, notice: a.error };
      return s.state === 'scanning'
        ? { ...s, state: 'reviewing', zones: findingsToZones(s.visual, s.width, s.height), notice: a.error }
        : s;
    case 'cloakStart':
      return s.state === 'reviewing' ? { ...s, state: 'cloaking', result: null } : s;
    case 'cloakDone':
      return s.state === 'cloaking' ? { ...s, state: 'result', result: a.result } : s;
    case 'editZones':
      return s.state === 'result' ? { ...s, state: 'reviewing', result: null } : s;
    case 'fail':
      return s.state === 'idle' ? s : { ...s, state: 'error', error: a.error };
  }
}

/**
 * Which usage tick a transition produces: one `scan` when a photo
 * enters scanning, one `cloak` each time a verified result is produced. Kept pure so the
 * reducer stays side-effect free; SessionProvider sends the tick.
 */
export function usageEvent(prev: PhotoSession, next: PhotoSession): 'scan' | 'cloak' | null {
  if (next.state === 'scanning' && (prev.state !== 'scanning' || prev.id !== next.id)) return 'scan';
  if (next.state === 'result' && prev.state !== 'result' && next.result?.verified === true) return 'cloak';
  return null;
}
