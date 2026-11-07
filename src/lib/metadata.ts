// Read identifying metadata and group it into findings (one finding per group).
import exifr from 'exifr';
import type { MetadataFinding, MetadataGroup } from './types.ts';

export const EXIFR_OPTIONS = {
  tiff: true,
  exif: true,
  gps: true,
  xmp: true,
  iptc: true,
  icc: false,
  makerNote: false,
  userComment: true,
  translateValues: true,
  reviveValues: true,
} as const;

const IDENTITY_KEYS = [
  'SerialNumber',
  'BodySerialNumber',
  'LensSerialNumber',
  'InternalSerialNumber',
  'Artist',
  'OwnerName',
  'CameraOwnerName',
  'Copyright',
  'ImageUniqueID',
  'creator',
  'Creator',
  'By-line',
  'XPAuthor',
];
const OTHER_KEYS = [
  'ImageDescription',
  'UserComment',
  'XPComment',
  'XPTitle',
  'XPKeywords',
  'Caption-Abstract',
  'Keywords',
  'title',
  'description',
];

const ORDER: MetadataGroup[] = ['location', 'datetime', 'device', 'lens', 'software', 'identity', 'other'];

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString();
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(', ') || undefined;
  if (typeof v === 'object') {
    const value = (v as { value?: unknown }).value;
    return value !== undefined ? str(value) : undefined;
  }
  const s = String(v).replace(/\0/g, '').trim();
  return s || undefined;
}

function pick(raw: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (str(raw[k]) !== undefined) out[k] = raw[k];
  return out;
}

/** Group a raw exifr record into findings. Exported for tests. */
export function groupMetadata(raw: Record<string, unknown> | null | undefined): MetadataFinding[] {
  if (!raw) return [];
  const found = new Map<MetadataGroup, MetadataFinding>();
  const add = (
    group: MetadataGroup,
    fields: Record<string, unknown>,
    value: string | undefined,
    extra?: Partial<MetadataFinding>,
  ) => {
    if (!value) return;
    found.set(group, { group, label: `meta.${group}`, value, raw: fields, ...extra });
  };

  const lat = raw.latitude;
  const lon = raw.longitude;
  if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
    add(
      'location',
      pick(raw, ['latitude', 'longitude', 'GPSAltitude', 'GPSDateStamp', 'GPSTimeStamp']),
      `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      {
        geo: { lat, lon },
      },
    );
  }

  const dateKeys = ['DateTimeOriginal', 'CreateDate', 'DateCreated', 'ModifyDate'];
  const date = dateKeys.map((k) => raw[k]).find((v) => str(v));
  add('datetime', pick(raw, [...dateKeys, 'OffsetTimeOriginal']), str(date));

  add(
    'device',
    pick(raw, ['Make', 'Model']),
    [str(raw.Make), str(raw.Model)].filter(Boolean).join(' ') || undefined,
  );
  add('lens', pick(raw, ['LensMake', 'LensModel', 'LensInfo']), str(raw.LensModel) ?? str(raw.LensMake));
  add(
    'software',
    pick(raw, ['Software', 'HostComputer', 'CreatorTool']),
    [str(raw.Software), str(raw.HostComputer)].filter(Boolean).join(', ') || str(raw.CreatorTool),
  );

  const identity = pick(raw, IDENTITY_KEYS);
  add('identity', identity, Object.values(identity).map(str).filter(Boolean).join(', ') || undefined);
  const other = pick(raw, OTHER_KEYS);
  add('other', other, Object.values(other).map(str).filter(Boolean).join(', ') || undefined);

  return ORDER.flatMap((g) => (found.has(g) ? [found.get(g)!] : []));
}

/**
 * Display string for a finding in the user's locale: dates are localized, the location gains
 * "(near {place})" once the offline place lookup has filled `geo.place`.
 */
export function displayValue(
  f: MetadataFinding,
  locale: string,
  near: (place: string) => string = (p) => `(${p})`,
): string {
  if (f.group === 'location' && f.geo) {
    const coords = `${f.geo.lat.toFixed(4)}, ${f.geo.lon.toFixed(4)}`;
    return f.geo.place ? `${coords} ${near(f.geo.place)}` : coords;
  }
  if (f.group === 'datetime') {
    const d = new Date(f.value);
    if (!Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(f.value)) {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(d);
    }
  }
  return f.value;
}

/** Never throws: unreadable metadata is reported as none. */
export async function readMetadata(input: Blob | ArrayBuffer): Promise<MetadataFinding[]> {
  try {
    const buffer = input instanceof Blob ? await input.arrayBuffer() : input;
    return groupMetadata(await exifr.parse(buffer, EXIFR_OPTIONS));
  } catch {
    return [];
  }
}
