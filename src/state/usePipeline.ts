// Orchestrates one photo: decode + metadata in parallel, scan in the worker, cloak on demand.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cloak as runCloak } from '../lib/cloak.ts';
import { DecodeError, decodePhoto } from '../lib/decode.ts';
import type { MaskStyles } from '../lib/mask.ts';
import type { Zone } from '../lib/types.ts';
import { placeLabel } from '../lib/geo.ts';
import { warmModelCache } from '../lib/modelCache.ts';
import { readMetadata } from '../lib/metadata.ts';
import { InferenceClient, createInferenceWorker } from '../worker/client.ts';
import type { FromWorker } from '../worker/protocol.ts';
import { useSession } from './SessionProvider.tsx';

/** Long side of the copy sent to the detector (bounds memory; boxes are scaled back). */
export const DETECTION_MAX_SIDE = 3072;

export interface ScannerStatus {
  ready: boolean;
  progress: number;
  error: string | null;
}

let ids = 0;
const newId = () => `s${Date.now().toString(36)}${(ids++).toString(36)}`;

export function usePipeline(
  createClient: () => InferenceClient = () => new InferenceClient(createInferenceWorker()),
) {
  const { session, dispatch } = useSession();
  const client = useRef<InferenceClient | null>(null);
  // Frozen on first render: the default factory is a new function each render, and the worker
  // (runtime and models) must be created once for the life of the app.
  const factory = useRef(createClient);
  const scaleRef = useRef(1);
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const [scanner, setScanner] = useState<ScannerStatus>({ ready: false, progress: 0, error: null });
  const [offlineReady, setOfflineReady] = useState(false);
  const idleWaiters = useRef<(() => void)[]>([]);
  const busy = (st: string) => st === 'decoding' || st === 'scanning' || st === 'cloaking';
  const waitUntilIdle = useCallback(
    () =>
      busy(sessionRef.current.state)
        ? new Promise<void>((r) => idleWaiters.current.push(r))
        : Promise.resolve(),
    [],
  );
  useEffect(() => {
    if (busy(session.state)) return;
    const waiting = idleWaiters.current.splice(0);
    waiting.forEach((r) => r());
  }, [session.state]);
  const scannerError = useRef<string | null>(null);

  useEffect(() => {
    const c = factory.current();
    client.current = c;
    const loaded: Record<string, [number, number]> = {};
    const unsubscribe = c.subscribe((m: FromWorker) => {
      const s = sessionRef.current;
      switch (m.type) {
        case 'progress': {
          loaded[m.stage] = [m.loaded, m.total];
          const [l, t] = Object.values(loaded).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
          setScanner((p) => ({ ...p, progress: t ? l / t : 0 }));
          break;
        }
        case 'ready':
          setScanner({ ready: true, progress: 1, error: null });
          // Once the runtime is up, fetch every model in the background so the next visit
          // works offline. Files already cached are skipped; the download waits while busy.
          void warmModelCache(undefined, undefined, waitUntilIdle).then((ok) => {
            setOfflineReady(ok);
            if (ok) document.documentElement.dataset.offlineReady = 'true';
          });
          break;
        case 'finding': {
          const k = scaleRef.current;
          const finding = {
            ...m.finding,
            box: {
              x: m.finding.box.x * k,
              y: m.finding.box.y * k,
              w: m.finding.box.w * k,
              h: m.finding.box.h * k,
            },
          };
          dispatch({ type: 'finding', id: m.sessionId, finding });
          break;
        }
        case 'done':
          dispatch({ type: 'scanDone', id: m.sessionId });
          break;
        case 'error': {
          // The scanner failing never blocks cleaning: model-load and oom switch to manual mode.
          const manual = m.code === 'model-load' || m.code === 'oom';
          if (m.sessionId) {
            const error = { code: m.code === 'decode' ? ('decode' as const) : m.code, message: m.message };
            if (!manual) console.error('scan error', m.code, m.message);
            dispatch(
              manual
                ? { type: 'scanFailed', id: m.sessionId, error }
                : { type: 'fail', id: m.sessionId, error },
            );
          } else {
            scannerError.current = m.message;
            setScanner((p) => ({ ...p, error: m.message }));
            if (s.state === 'scanning' || s.state === 'decoding')
              dispatch({ type: 'scanFailed', id: s.id, error: { code: 'model-load', message: m.message } });
          }
        }
      }
    });
    c.init('webgpu');
    return () => {
      unsubscribe();
      c.terminate();
    };
  }, [dispatch, waitUntilIdle]);

  const pick = useCallback(
    async (file: File) => {
      const id = newId();
      dispatch({ type: 'pick', id, file });
      void readMetadata(file).then(async (metadata) => {
        dispatch({ type: 'metadata', id, metadata });
        // Offline place name from the bundled town list; never a network lookup elsewhere.
        const loc = metadata.find((m) => m.group === 'location');
        if (!loc?.geo) return;
        const place = await placeLabel(loc.geo.lat, loc.geo.lon);
        if (place)
          dispatch({
            type: 'metadata',
            id,
            metadata: metadata.map((m) => (m === loc ? { ...m, geo: { ...loc.geo!, place } } : m)),
          });
      });
      try {
        const decoded = await decodePhoto(file);
        dispatch({ type: 'decoded', id, ...decoded });
        const long = Math.max(decoded.width, decoded.height);
        const k = long > DETECTION_MAX_SIDE ? DETECTION_MAX_SIDE / long : 1;
        const copy = await createImageBitmap(
          decoded.bitmap,
          k < 1
            ? {
                resizeWidth: Math.round(decoded.width * k),
                resizeHeight: Math.round(decoded.height * k),
                resizeQuality: 'high',
              }
            : {},
        );
        scaleRef.current = decoded.width / copy.width;
        if (scannerError.current) {
          copy.close();
          dispatch({ type: 'scanFailed', id, error: { code: 'model-load', message: scannerError.current } });
        } else client.current?.scan(id, copy, ['face', 'text', 'person']);
      } catch (e) {
        dispatch({
          type: 'fail',
          id,
          error: e instanceof DecodeError ? e.appError : { code: 'unknown', message: String(e) },
        });
      }
    },
    [dispatch],
  );

  const skip = useCallback(() => {
    const s = sessionRef.current;
    client.current?.cancel(s.id);
    dispatch({ type: 'scanCancel', id: s.id });
  }, [dispatch]);

  const cloak = useCallback(
    async (style: MaskStyles = {}) => {
      const s = sessionRef.current;
      if (!s.bitmap) return;
      dispatch({ type: 'cloakStart', id: s.id });
      try {
        const result = await runCloak(s.bitmap, s.zones, s.metadata, style);
        dispatch({ type: 'cloakDone', id: s.id, result });
      } catch (e) {
        dispatch({ type: 'fail', id: s.id, error: { code: 'unknown', message: String(e) } });
      }
    },
    [dispatch],
  );

  const reset = useCallback(() => {
    const s = sessionRef.current;
    if (s.id) client.current?.cancel(s.id);
    dispatch({ type: 'reset' });
  }, [dispatch]);

  const proceed = useCallback(() => dispatch({ type: 'continue', id: sessionRef.current.id }), [dispatch]);
  const setZones = useCallback(
    (zones: Zone[]) => dispatch({ type: 'zones', id: sessionRef.current.id, zones }),
    [dispatch],
  );
  const editZones = useCallback(() => dispatch({ type: 'editZones', id: sessionRef.current.id }), [dispatch]);

  return { session, scanner, offlineReady, pick, skip, proceed, cloak, reset, setZones, editZones };
}

export type Pipeline = ReturnType<typeof usePipeline>;
