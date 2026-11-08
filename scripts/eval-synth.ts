// Multi-script part of the eval: `pnpm eval:synth` renders real words in many scripts onto the
// cached eval photos (fonts from the system, so the result depends on the machine) and writes
// tests/eval/.cache/synth.json, which `pnpm eval` then scores with the rest.
// Each photo gets one main script plus Latin and numbers, as real signs and labels do.
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SetImage } from './eval.ts';

const CACHE = 'tests/eval/.cache';
const OUT = join(CACHE, 'synth');

/** Words and fonts per script. Fonts are tried in order; the first installed one is used. */
export const SCRIPTS: Record<string, { words: string[]; fonts: string[] }> = {
  chinese: {
    words: ['北京欢迎你', '营业时间', '出口', '禁止吸烟', '中国银行', '地铁站', '人民路', '小心地滑'],
    fonts: ['PingFang SC', 'Heiti SC', 'Songti SC', 'Hiragino Sans GB'],
  },
  japanese: {
    words: ['東京駅', 'ラーメン', 'いらっしゃいませ', '営業中', '駐車場', 'コンビニ', '本日のおすすめ'],
    fonts: ['Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Hiragino Mincho ProN'],
  },
  korean: {
    words: ['서울역', '커피전문점', '영업시간', '출구', '안녕하세요', '편의점', '주차금지'],
    fonts: ['Apple SD Gothic Neo', 'AppleGothic'],
  },
  cyrillic: {
    words: ['Москва', 'АПТЕКА', 'Продукты', 'ВЫХОД', 'Улица Ленина', 'Київ', 'ВІДЧИНЕНО', 'Ресторан'],
    fonts: ['Helvetica Neue', 'Arial', 'Times New Roman'],
  },
  arabic: {
    words: ['مرحبا', 'القاهرة', 'صيدلية', 'مطعم', 'شارع الملك', 'مخبز', 'مفتوح'],
    fonts: ['Geeza Pro', 'Damascus', 'Baghdad'],
  },
  devanagari: {
    words: ['नमस्ते', 'दिल्ली', 'बाज़ार', 'दुकान', 'स्टेशन', 'भोजनालय', 'स्वागत है'],
    fonts: ['Kohinoor Devanagari', 'Devanagari Sangam MN', 'ITF Devanagari'],
  },
  thai: {
    words: ['สวัสดี', 'กรุงเทพ', 'ร้านอาหาร', 'ตลาด', 'ทางออก', 'ยินดีต้อนรับ'],
    fonts: ['Thonburi', 'Ayuthaya', 'Silom'],
  },
  greek: {
    words: ['ΑΘΗΝΑ', 'Καλημέρα', 'ΦΑΡΜΑΚΕΙΟ', 'Ταβέρνα', 'ΕΞΟΔΟΣ', 'Οδός Ερμού'],
    fonts: ['Helvetica Neue', 'Arial', 'Times New Roman'],
  },
  tamil: {
    words: ['வணக்கம்', 'சென்னை', 'கடை', 'உணவகம்', 'வரவேற்பு'],
    fonts: ['Tamil Sangam MN', 'Tamil MN'],
  },
  telugu: {
    words: ['హైదరాబాద్', 'స్వాగతం', 'దుకాణం', 'హోటల్'],
    fonts: ['Kohinoor Telugu', 'Telugu Sangam MN', 'Telugu MN'],
  },
  latin: {
    words: ['Bäckerei', 'Café Crème', 'Łódź', '¡Hola!', 'São Paulo', 'Größe', 'Çay Evi', 'Ångström'],
    fonts: ['Helvetica Neue', 'Arial', 'Times New Roman'],
  },
  numbers: {
    words: ['75008', '+33 6 12 34 56 78', '2024', '12:45', 'AB-123-CD', '€ 4,50', '1/2', '0'],
    fonts: ['Helvetica Neue', 'Arial', 'Times New Roman'],
  },
};

/** Small deterministic generator so the set is the same on every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const installed = new Set(GlobalFonts.families.map((f) => f.family));
const fontFor = (script: string, r: () => number) => {
  const ok = SCRIPTS[script]!.fonts.filter((f) => installed.has(f));
  return ok[Math.floor(r() * ok.length)] ?? 'sans-serif';
};

export interface SynthImage extends SetImage {
  /** Script of each labelled box, same order as `boxes`. */
  scripts: string[];
}

async function main() {
  const photos = readdirSync(join(CACHE, 'images'))
    .filter((f) => f.startsWith('oi-'))
    .sort();
  if (!photos.length) throw new Error('No cached photos: run `pnpm eval` once first.');
  mkdirSync(OUT, { recursive: true });
  const main = Object.keys(SCRIPTS).filter((s) => s !== 'numbers');
  const images: SynthImage[] = [];
  let n = 0;
  for (const script of main)
    for (let k = 0; k < 3; k++) {
      const r = rng(1000 + n);
      const photo = photos[n++ % photos.length]!;
      const img = await loadImage(join(CACHE, 'images', photo));
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const W = Math.round(img.width * scale);
      const H = Math.round(img.height * scale);
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      const taken: { x: number; y: number; w: number; h: number }[] = [];
      const boxes: SetImage['boxes'] = [];
      const scripts: string[] = [];
      const items = [
        ...Array.from({ length: 4 }, () => script),
        script === 'latin' ? 'numbers' : 'latin',
        'numbers',
      ];
      for (const s of items) {
        const words = SCRIPTS[s]!.words;
        const word = words[Math.floor(r() * words.length)]!;
        const size = Math.round(H * (0.025 + r() * 0.05));
        const font = fontFor(s, r);
        ctx.font = `${r() < 0.5 ? 'bold ' : ''}${size}px "${font}"`;
        const m = ctx.measureText(word);
        const tw = m.width;
        const th = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
        const pad = size * 0.3;
        const bw = tw + 2 * pad;
        const bh = th + 2 * pad;
        if (bw > W * 0.9) continue;
        let placed = null;
        for (let tries = 0; tries < 40 && !placed; tries++) {
          const x = r() * (W - bw);
          const y = r() * (H - bh);
          const c = { x, y, w: bw, h: bh };
          if (!taken.some((t) => x < t.x + t.w && t.x < x + bw && y < t.y + t.h && t.y < y + bh)) placed = c;
        }
        if (!placed) continue;
        taken.push(placed);
        const dark = r() < 0.5;
        ctx.globalAlpha = 0.55 + r() * 0.4;
        ctx.fillStyle = dark ? '#111' : '#f4f1e8';
        ctx.fillRect(placed.x, placed.y, bw, bh);
        ctx.globalAlpha = 1;
        ctx.fillStyle = dark
          ? ['#fff', '#ffd23f', '#9ef'][Math.floor(r() * 3)]!
          : ['#111', '#b00', '#036'][Math.floor(r() * 3)]!;
        ctx.textBaseline = 'alphabetic';
        const tx = placed.x + pad;
        const ty = placed.y + pad + m.actualBoundingBoxAscent;
        ctx.fillText(word, tx, ty);
        boxes.push({
          cat: 'text',
          text: word,
          x: (tx - m.actualBoundingBoxLeft) / W,
          y: (ty - m.actualBoundingBoxAscent) / H,
          w: tw / W,
          h: th / H,
        });
        scripts.push(s);
      }
      const id = `synth-${script}-${k}`;
      const path = join(OUT, `${id}.jpg`);
      writeFileSync(path, await canvas.encode('jpeg', 88));
      images.push({ id, path, scope: ['text'], boxes, scripts, ignore: [], partial: true });
    }
  writeFileSync(join(CACHE, 'synth.json'), JSON.stringify({ images }, null, 1));
  console.log(`${images.length} photos in ${OUT}, labels in ${join(CACHE, 'synth.json')}`);
}

if (existsSync(CACHE) && process.argv[1]?.endsWith('eval-synth.ts')) await main();
