// Cache Storage name for models and the ONNX Runtime files. It changes when either changes,
// so the app drops the old copy instead of serving stale binaries.
import { readFileSync } from 'node:fs';

export function modelCacheName(root = '.'): string {
  const models = JSON.parse(readFileSync(`${root}/models/manifest.json`, 'utf8')) as { version: number };
  const ort = JSON.parse(readFileSync(`${root}/node_modules/onnxruntime-web/package.json`, 'utf8')) as {
    version: string;
  };
  return `terces-models-v${models.version}-ort${ort.version}`;
}

export const MODEL_CACHE_PREFIX = 'terces-models-';
