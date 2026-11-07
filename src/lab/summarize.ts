// Device lab (Phase 0): summarises which metadata survived the platform's photo picker.

export type LabGroup = 'gps' | 'date' | 'device' | 'identity' | 'other';

export interface LabField {
  key: string;
  value: string;
  group: LabGroup;
}

export interface LabSummary {
  groups: Record<LabGroup, LabField[]>;
  hasGps: boolean;
  fieldCount: number;
}

const GPS = /^(GPS|latitude|longitude)/i;
const DATE = /(DateTime|CreateDate|ModifyDate|OffsetTime|SubSecTime)/i;
const DEVICE = /^(Make|Model|LensMake|LensModel|LensInfo|Software|HostComputer)$/i;
const IDENTITY = /(Serial|Artist|Owner|Copyright|ImageUniqueID|Creator|Author)/i;

export function groupOf(key: string): LabGroup {
  if (GPS.test(key)) return 'gps';
  if (DATE.test(key)) return 'date';
  if (DEVICE.test(key)) return 'device';
  if (IDENTITY.test(key)) return 'identity';
  return 'other';
}

export function formatValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array || ArrayBuffer.isView(value))
    return `<${(value as ArrayBufferView).byteLength} bytes>`;
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function summarize(parsed: Record<string, unknown> | undefined | null): LabSummary {
  const groups: Record<LabGroup, LabField[]> = { gps: [], date: [], device: [], identity: [], other: [] };
  for (const [key, raw] of Object.entries(parsed ?? {})) {
    if (raw === undefined || raw === null) continue;
    const field = { key, value: formatValue(raw), group: groupOf(key) };
    groups[field.group].push(field);
  }
  const fieldCount = Object.values(groups).reduce((n, g) => n + g.length, 0);
  return { groups, hasGps: groups.gps.some((f) => /^(latitude|GPSLatitude)$/i.test(f.key)), fieldCount };
}
