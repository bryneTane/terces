// Scoring for `pnpm eval`: compares the zones the app would cover against labelled boxes.
// All boxes are fractions of the image size (0..1).

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Family = 'text' | 'face';
export interface Labelled extends Box {
  cat: 'text' | 'face' | 'plate';
  text?: string;
}
export interface Predicted extends Box {
  cat: 'text' | 'face' | 'plate' | 'person' | 'manual';
  text?: string;
}
export interface EvalImage {
  id: string;
  scope: ('text' | 'face' | 'plate')[];
  boxes: Labelled[];
  ignore: (Box & { cat?: string })[];
  /** Only some instances are labelled (text added onto a photo): zones elsewhere are not counted as false. */
  partial?: boolean;
}

/** Text and plates are one family: a plate is text, and either kind of zone hides either. */
export const familyOf = (cat: string): Family | null =>
  cat === 'face' ? 'face' : cat === 'text' || cat === 'plate' ? 'text' : null;

/** A labelled box counts as hidden when at least this share of it is under zones. */
export const COVERED = 0.8;
/** A zone is false when less than this share of it touches labelled or ignored boxes. */
export const ON_TARGET = 0.2;
const GRID = 12;

const inside = (px: number, py: number, b: Box) =>
  px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;

/** Share of `b` (sampled on a grid) that lies inside any of `cover`. */
export function shareInside(b: Box, cover: Box[]): number {
  if (!cover.length) return 0;
  let n = 0;
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      const px = b.x + ((i + 0.5) / GRID) * b.w;
      const py = b.y + ((j + 0.5) / GRID) * b.h;
      if (cover.some((c) => inside(px, py, c))) n++;
    }
  return n / (GRID * GRID);
}

export interface FamilyScore {
  labelled: number;
  covered: number;
  zones: number;
  falseZones: number;
  misses: Labelled[];
  falses: Predicted[];
}

/** Scores one image, for each family in its scope. */
export function scoreImage(img: EvalImage, zones: Predicted[]): Partial<Record<Family, FamilyScore>> {
  const out: Partial<Record<Family, FamilyScore>> = {};
  const families = new Set(img.scope.map(familyOf).filter((f): f is Family => !!f));
  for (const fam of families) {
    const mine = zones.filter((z) => familyOf(z.cat) === fam);
    const labelled = img.boxes.filter((b) => familyOf(b.cat) === fam);
    const ignored = img.ignore.filter((b) => !b.cat || familyOf(b.cat) === fam);
    const misses = labelled.filter((b) => shareInside(b, mine) < COVERED);
    // False zones need every instance labelled: a photo scoped to plates only does not label
    // its shop signs, so its other text zones are not counted against the app.
    const complete = img.scope.includes(fam) && !img.partial;
    const falses = complete ? mine.filter((z) => shareInside(z, [...labelled, ...ignored]) < ON_TARGET) : [];
    out[fam] = {
      labelled: labelled.length,
      covered: labelled.length - misses.length,
      zones: mine.length,
      falseZones: falses.length,
      misses,
      falses,
    };
  }
  return out;
}

export interface Totals {
  images: number;
  labelled: number;
  covered: number;
  zones: number;
  falseZones: number;
  /** Share of labelled boxes hidden: the privacy number. */
  recall: number;
  /** Share of zones that cover something real. */
  precision: number;
  /** False zones per image: what a user has to switch off by hand. */
  falsePerImage: number;
}

export function totals(scores: Partial<Record<Family, FamilyScore>>[], fam: Family): Totals {
  const s = scores.map((x) => x[fam]).filter((x): x is FamilyScore => !!x);
  const sum = (k: 'labelled' | 'covered' | 'zones' | 'falseZones') => s.reduce((a, x) => a + x[k], 0);
  const t = {
    labelled: sum('labelled'),
    covered: sum('covered'),
    zones: sum('zones'),
    falseZones: sum('falseZones'),
  };
  return {
    images: s.length,
    ...t,
    recall: t.labelled ? t.covered / t.labelled : 1,
    precision: t.zones ? 1 - t.falseZones / t.zones : 1,
    falsePerImage: s.length ? t.falseZones / s.length : 0,
  };
}

/** Edit distance between two strings, by code point. */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = y.map((_, j) => j + 1);
  prev.unshift(0);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++)
      cur.push(Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[y.length]!;
}

/** A word counts as read right when at most this share of its characters is wrong (spaces ignored). */
export const READ_RIGHT = 0.2;

export function readRight(read: string | undefined, label: string): boolean {
  const a = (read ?? '').replace(/\s+/g, '');
  const b = label.replace(/\s+/g, '');
  return !!a && editDistance(a, b) <= READ_RIGHT * Math.max(1, [...b].length);
}
