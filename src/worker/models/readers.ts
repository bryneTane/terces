// Text readers for every alphabet PP-OCRv5 covers, and how one reading is chosen per text box.
//
// Every reader also knows basic Latin and digits, so the most confident reading is not the
// right one: a Greek reader reads "Bäckerei" as "Bckerei" with more confidence than the Latin
// reader. A reading counts for an alphabet only when it is evidence of it: confident, mostly
// letters of that alphabet, and (for Greek and Cyrillic) with at least one letter that does not
// also look Latin. Otherwise the Latin reading is kept. Thresholds come from `pnpm eval`.

export interface Reader {
  /** Alphabet key, also the suffix of the manifest names (`ppocr-rec-<key>`, `ppocr-dict-<key>`). */
  key: string;
  /** Letters of this alphabet; absent for Latin, the fallback. */
  letters?: RegExp;
  /** Letters of this alphabet that also look Latin, so they prove nothing on their own. */
  lookalikes?: string;
  /** Latin letters the reader sometimes outputs inside a word of its own alphabet, and their match. */
  toNative?: [latin: string, native: string];
  /** Output comes in visual order (right to left scripts). */
  rtl?: boolean;
}

export const READERS: readonly Reader[] = [
  { key: 'latin' },
  { key: 'zh', letters: /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/ },
  { key: 'korean', letters: /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/ },
  {
    key: 'cyrillic',
    letters: /[\u0400-\u04ff]/,
    lookalikes: 'АаВЕеКМНОоРрСсТуХхІіЈјЅѕ',
    toNative: ['AaBCcEeHKMOoPpTXxy', 'АаВСсЕеНКМОоРрТХху'],
  },
  { key: 'arabic', letters: /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/, rtl: true },
  { key: 'devanagari', letters: /[\u0900-\u097f]/ },
  { key: 'th', letters: /[\u0e00-\u0e7f]/ },
  {
    key: 'el',
    letters: /[\u0370-\u03ff\u1f00-\u1fff]/,
    lookalikes: 'ΑΒΕΖΗΙΚΜΝΟΡΤΥΧοικνυ',
    toNative: ['ABEHIKMNOPTXYZov', 'ΑΒΕΗΙΚΜΝΟΡΤΧΥΖον'],
  },
  { key: 'ta', letters: /[\u0b80-\u0bff]/ },
  { key: 'te', letters: /[\u0c00-\u0c7f]/ },
];

/** Mean probability for the Latin reading to count as read. */
export const LATIN_MIN_SCORE = 0.5;
/** Mean probability for another alphabet's reading to count as evidence (eval: 0.8 keeps the most words right with the fewest wrong alphabets on Latin photos). */
export const NATIVE_MIN_SCORE = 0.8;

export interface Reading {
  text: string;
  score: number;
}

const isLetter = (c: string) => /\p{L}/u.test(c);

/** True when `r` shows text in `reader`'s own alphabet (see the file comment). */
export function isEvidence(reader: Reader, r: Reading): boolean {
  if (!reader.letters || r.score < NATIVE_MIN_SCORE) return false;
  const letters = [...r.text].filter(isLetter);
  const native = letters.filter((c) => reader.letters!.test(c));
  if (native.length * 2 <= letters.length) return false;
  return !reader.lookalikes || native.some((c) => !reader.lookalikes!.includes(c));
}

/**
 * Within words of the reader's alphabet, Latin lookalikes become the native letter. A capital
 * after a lowercase letter stands for the lowercase one ("ЛеHиHa" → "Ленина").
 */
export function toNative(reader: Reader, text: string): string {
  if (!reader.toNative || !reader.letters) return text;
  const [from, to] = reader.toNative;
  const word = (w: string) => {
    const cs = [...w];
    if (!cs.some((c) => reader.letters!.test(c))) return w;
    return cs
      .map((c, i) => {
        const k = from.indexOf(c);
        if (k < 0) return c;
        const prev = cs[i - 1];
        const lower = prev !== undefined && prev !== prev.toUpperCase();
        return lower ? to[k]!.toLowerCase() : to[k]!;
      })
      .join('');
  };
  return text.split(' ').map(word).join(' ');
}

/** Visual order to reading order, as PaddleOCR does: runs of Latin, digits and signs keep their order. */
export function rtlOrder(text: string): string {
  const runs: string[] = [];
  let ltr = '';
  for (const c of text) {
    if (/[a-zA-Z0-9:*./%+-]/.test(c)) ltr += c;
    else {
      if (ltr) runs.push(ltr);
      runs.push(c);
      ltr = '';
    }
  }
  if (ltr) runs.push(ltr);
  return runs.reverse().join('').trim();
}

/**
 * Text that most readers read the same way, each with confidence: every reader knows digits and
 * basic Latin, so agreement catches what the Latin reader alone is unsure of (a lone "0").
 */
function agreed(readings: ReadonlyMap<string, Reading>): Reading | null {
  const votes = new Map<string, number[]>();
  for (const r of readings.values())
    if (r.text && r.score >= NATIVE_MIN_SCORE) votes.set(r.text, [...(votes.get(r.text) ?? []), r.score]);
  for (const [text, scores] of votes)
    if (scores.length * 2 > readings.size)
      return { text, score: scores.reduce((a, b) => a + b, 0) / scores.length };
  return null;
}

/**
 * The reading of one box from every reader's reading of it (keyed by reader key; readers that
 * could not run are simply absent), with its confidence. Null when nothing was read.
 */
export function bestReading(readings: ReadonlyMap<string, Reading>): Reading | null {
  let best: { reader: Reader; r: Reading } | null = null;
  for (const reader of READERS) {
    const r = readings.get(reader.key);
    if (r && isEvidence(reader, r) && (!best || r.score > best.r.score)) best = { reader, r };
  }
  if (best) {
    const text = toNative(best.reader, best.r.text);
    return { text: best.reader.rtl ? rtlOrder(text) : text, score: best.r.score };
  }
  const latin = readings.get('latin');
  const sure = latin && latin.text && latin.score >= LATIN_MIN_SCORE ? latin : null;
  const all = agreed(readings);
  return all && (!sure || all.score > sure.score) ? all : sure;
}

/** The text of one box (see `bestReading`). */
export const chooseReading = (readings: ReadonlyMap<string, Reading>): string | null =>
  bestReading(readings)?.text ?? null;

/** Confidence a single character needs to count as read (see `isRead`). */
export const ONE_CHAR_MIN_SCORE = 0.9;

/**
 * Whether a box was read, so it is marked as text. The detector also fires on flowers, leaves
 * and faces; only what a reader can read is marked, and people draw zones over anything else.
 * A single character counts only when read with confidence.
 */
export const isRead = (reading: Reading | null): reading is Reading =>
  !!reading && ([...reading.text.replace(/\s/g, '')].length > 1 || reading.score >= ONE_CHAR_MIN_SCORE);
