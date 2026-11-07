import { expectTypeOf, test } from 'vitest';
import type { AppErrorCode, SessionState, VisualCategory, Zone, MetadataGroup } from '../../src/lib/types.ts';

test('entity enums are the documented ones', () => {
  expectTypeOf<SessionState>().toEqualTypeOf<
    'idle' | 'decoding' | 'scanning' | 'scanned' | 'reviewing' | 'cloaking' | 'result' | 'error'
  >();
  expectTypeOf<VisualCategory>().toEqualTypeOf<'face' | 'text' | 'plate' | 'person'>();
  expectTypeOf<MetadataGroup>().toEqualTypeOf<
    'location' | 'datetime' | 'device' | 'lens' | 'software' | 'identity' | 'other'
  >();
  expectTypeOf<Zone['kind']>().toEqualTypeOf<'detected' | 'manual'>();
  expectTypeOf<AppErrorCode>().toEqualTypeOf<
    'decode' | 'heic' | 'model-load' | 'oom' | 'verify-failed' | 'unknown'
  >();
});
