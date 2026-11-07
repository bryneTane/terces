import type { CSSProperties } from 'react';
import { useI18n } from '../i18n.tsx';
import { Icon, type IconName } from './Icon.tsx';

// Boxes on the example image, in percent of its width and height.
interface Find {
  x: number;
  y: number;
  w: number;
  h: number;
  keep?: boolean;
  label: string;
  below?: boolean;
  /** A group box: its faces get their own masks instead of one big block. */
  group?: boolean;
}

const FINDS: Find[] = [
  { x: 25.0, y: 40.0, w: 8.3, h: 15.6, keep: true, label: 'hero.keep', below: true },
  { x: 43.3, y: 37.5, w: 8.8, h: 16.3, keep: true, label: 'hero.keep', below: true },
  { x: 6.2, y: 41.2, w: 13.4, h: 8.8, label: 'hero.customers', group: true },
  { x: 52.8, y: 37.8, w: 9.5, h: 7.0, label: 'hero.passers', group: true },
  { x: 67.4, y: 36.4, w: 13.8, h: 19.0, label: 'hero.kids', group: true },
  { x: 27.5, y: 0.6, w: 20.8, h: 20.0, label: 'hero.cafe', below: true },
  { x: 89.8, y: 29.1, w: 3.8, h: 3.4, label: 'hero.sign', below: true },
  { x: 93.8, y: 56.9, w: 6.0, h: 2.9, label: 'hero.plate' },
];

const FACES = [
  { x: 6.7, y: 41.9, w: 3.7, h: 6.2 },
  { x: 15.4, y: 43.5, w: 3.3, h: 5.9 },
  { x: 36.7, y: 44.6, w: 2.3, h: 4.4 },
  { x: 39.6, y: 44.4, w: 2.5, h: 4.4 },
  { x: 53.3, y: 43.8, w: 2.9, h: 5.0 },
  { x: 58.8, y: 38.5, w: 2.9, h: 4.6 },
  { x: 67.9, y: 36.9, w: 2.9, h: 5.0 },
  { x: 71.8, y: 49.4, w: 3.2, h: 5.6 },
  { x: 77.5, y: 47.5, w: 3.2, h: 5.6 },
];

type Style = 'blur' | 'mosaic' | 'emoji';
type Rect = { x: number; y: number; w: number; h: number };
type MaskSpec = Rect & { style: Style; face?: boolean; emoji?: string; head?: Rect };

/** A mix of the cover styles the app offers. Babies only on the two children. */
const FACE_STYLES: Pick<MaskSpec, 'style' | 'emoji' | 'head'>[] = [
  // Seen from behind: the face box is only the side of his head, so the emoji gets the whole head.
  { style: 'emoji', emoji: '😎', head: { x: 5.0, y: 39.2, w: 7.4, h: 11.1 } },
  { style: 'blur' },
  { style: 'mosaic' },
  { style: 'emoji', emoji: '🙂' },
  { style: 'blur' },
  { style: 'mosaic' },
  { style: 'blur' }, // the parent
  { style: 'emoji', emoji: '👶' }, // child
  { style: 'emoji', emoji: '👶' }, // child
];
const FINDS_STYLE: Record<string, Style> = {
  'hero.cafe': 'blur',
  'hero.sign': 'mosaic',
  'hero.plate': 'mosaic',
};
const MASKS: MaskSpec[] = [
  ...FINDS.filter((f) => !f.keep && !f.group).map((f) => ({ ...f, style: FINDS_STYLE[f.label] ?? 'blur' })),
  ...FACES.map((f, i) => ({ ...f, face: true, ...FACE_STYLES[i]! })),
];

/** Things the example gives away: one per box or face, plus five metadata groups. */
export const HERO_COUNT = FACES.length + FINDS.filter((f) => !f.keep && !f.group).length + 5;

const box = (r: Rect): CSSProperties => ({
  left: `${r.x}%`,
  top: `${r.y}%`,
  width: `${r.w}%`,
  height: `${r.h}%`,
});

/**
 * Each mask holds a tiny copy of the photo, stretched to full size and aligned so only the masked
 * area shows. Pixelated, it is the mosaic; pre-blurred and smoothed, it is the blur. No CSS
 * filters, so it looks the same in every browser.
 */
const crop = (r: Rect, src: string): CSSProperties => ({
  width: `${10000 / r.w}%`,
  height: `${10000 / r.h}%`,
  left: `${(-r.x / r.w) * 100}%`,
  top: `${(-r.y / r.h) * 100}%`,
  backgroundImage: `url(${src})`,
  backgroundSize: '100% 100%',
});

/** The example photo's size in px, to keep feathering even in both directions. */
const PW = 1600;
const PH = 1067;
/** Same geometry as the app: face ellipses 1.2 times the inscribed one, blur fading outside. */
const FACE_ELLIPSE = 1.2;
const FEATHER = 0.35;

function Mask({ m }: { m: MaskSpec }) {
  const soft = m.style !== 'mosaic';
  // Feather in photo px, then the area the mask element spans (the zone plus its soft edge).
  const f = soft ? FEATHER * Math.min((m.w / 100) * PW, (m.h / 100) * PH) : 0;
  const k = m.face ? FACE_ELLIPSE : 1;
  const hw = (m.w / 100) * PW * (k / 2) + f;
  const hh = (m.h / 100) * PH * (k / 2) + f;
  const cx = m.x + m.w / 2;
  const cy = m.y + m.h / 2;
  const area: Rect = {
    x: cx - (hw / PW) * 100,
    y: cy - (hh / PH) * 100,
    w: ((2 * hw) / PW) * 100,
    h: ((2 * hh) / PH) * 100,
  };
  let mask: string | undefined;
  if (m.face) {
    // Solid out to the face ellipse, then fading over the feather.
    const solid = Math.min((hw - f) / hw, (hh - f) / hh) * 100;
    mask = `radial-gradient(closest-side, #000 ${soft ? solid : 96}%, transparent 100%)`;
  } else if (soft) {
    const fx = (f / (2 * hw)) * 100;
    const fy = (f / (2 * hh)) * 100;
    mask = `linear-gradient(to right, transparent, #000 ${fx}%, #000 ${100 - fx}%, transparent), linear-gradient(to bottom, transparent, #000 ${fy}%, #000 ${100 - fy}%, transparent)`;
  }
  const masking: CSSProperties = mask
    ? {
        maskImage: mask,
        WebkitMaskImage: mask,
        ...(m.face ? {} : { maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }),
      }
    : {};
  // Emoji: a square about 1.45 times the face, raised a little so it covers the hair too.
  const side = Math.max((m.w / 100) * PW, (m.h / 100) * PH) * 1.45;
  const head: Rect = m.head ?? {
    x: cx - (side / 2 / PW) * 100,
    y: cy - 0.1 * m.h - (side / 2 / PH) * 100,
    w: (side / PW) * 100,
    h: (side / PH) * 100,
  };
  return (
    <>
      <span aria-hidden="true" data-mask={m.style} className="anim-cloak absolute" style={box(area)}>
        <span className="absolute inset-0 overflow-hidden" style={masking}>
          <span
            className="absolute max-w-none"
            style={{
              // Blur: an 80 px copy of the photo, blurred beforehand and stretched smoothly. A CSS
              // blur filter fades to transparent at the photo's edge and lets the original show.
              ...crop(area, soft ? '/hero/cafe-blur.webp' : '/hero/cafe-pixels.webp'),
              ...(soft ? {} : { imageRendering: 'pixelated' }),
            }}
          />
        </span>
      </span>
      {m.emoji && (
        <svg
          aria-hidden="true"
          viewBox="0 0 10 10"
          className="anim-cloak absolute overflow-visible"
          style={box(head)}
        >
          <text x="5" y="5.5" fontSize="10" textAnchor="middle" dominantBaseline="middle">
            {m.emoji}
          </text>
        </svg>
      )}
    </>
  );
}

function Corners({ color }: { color: string }) {
  const c = 'absolute size-2 sm:size-3 border-solid';
  return (
    <>
      <span className={`${c} -left-[3px] -top-[3px] border-l-2 border-t-2`} style={{ borderColor: color }} />
      <span className={`${c} -right-[3px] -top-[3px] border-r-2 border-t-2`} style={{ borderColor: color }} />
      <span
        className={`${c} -bottom-[3px] -left-[3px] border-b-2 border-l-2`}
        style={{ borderColor: color }}
      />
      <span
        className={`${c} -bottom-[3px] -right-[3px] border-b-2 border-r-2`}
        style={{ borderColor: color }}
      />
    </>
  );
}

function Tag({
  icon,
  kicker,
  value,
  sub,
  className,
  delay,
}: {
  icon: IconName;
  kicker: string;
  value: string;
  sub?: string;
  className: string;
  delay: number;
}) {
  return (
    <div
      className={`anim-tag absolute flex items-center gap-3 border border-edge bg-[rgb(8_18_28/0.95)] px-3.5 py-2.5 shadow-[0_16px_40px_rgb(0_0_0/0.5)] ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <span className="grid size-8 place-items-center bg-alert text-void">
        <Icon name={icon} />
      </span>
      <span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-dim">{kicker}</span>
        <span className="block text-sm font-semibold">{value}</span>
        {sub && <span className="block font-mono text-[11px] text-dim">{sub}</span>}
      </span>
    </div>
  );
}

/**
 * The example scan on the landing page: an AI-generated café scene with what a scan would find.
 * The two friends stay visible; everyone and everything else gets masked, in a loop.
 */
export function HeroPhoto() {
  const { t } = useI18n();
  return (
    <figure className="m-0">
      <div className="rulers">
        <div
          data-photo
          className="relative aspect-[3/2] border border-edge shadow-[0_50px_120px_rgb(0_0_0/0.65),0_0_80px_rgb(141_232_255/0.08)]"
        >
          <img
            src="/hero/cafe-1600.webp"
            srcSet="/hero/cafe-960.webp 960w, /hero/cafe-1600.webp 1600w"
            sizes="(min-width: 1024px) 640px, 100vw"
            width={1600}
            height={1067}
            alt={t('hero.alt')}
            fetchPriority="high"
            className="absolute inset-0 block size-full object-cover"
          />
          {MASKS.map((m, i) => (
            <Mask key={i} m={m} />
          ))}
          <div
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden bg-[linear-gradient(rgb(141_232_255/0.07)_1px,transparent_1px),linear-gradient(90deg,rgb(141_232_255/0.07)_1px,transparent_1px)] bg-[size:36px_36px]"
          >
            <div className="anim-beam absolute inset-x-0 -mt-[110px] h-[110px] border-b-2 border-accent bg-[linear-gradient(180deg,transparent,rgb(141_232_255/0.2))] shadow-[0_8px_30px_rgb(141_232_255/0.55)]" />
          </div>
          {FINDS.map((f, i) => {
            const color = f.keep ? 'var(--color-accent)' : 'var(--color-alert)';
            return (
              <div
                key={i}
                aria-hidden="true"
                className="anim-lock absolute"
                style={{ ...box(f), animationDelay: `${0.3 + i * 0.15}s` }}
              >
                <Corners color={color} />
                <span
                  className={`absolute -left-[3px] whitespace-nowrap px-1.5 py-px font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-void max-sm:hidden ${f.below ? 'top-full mt-1.5' : 'bottom-full mb-1.5'}`}
                  style={{ background: color }}
                >
                  {t(f.label)}
                </span>
              </div>
            );
          })}
          <Tag
            icon="pin"
            kicker={t('hero.location')}
            value={t('hero.locationValue')}
            sub="48.8566 N, 2.3522 E"
            className="right-2 top-2 max-sm:hidden lg:-right-8 lg:top-[6%]"
            delay={1.1}
          />
          <Tag
            icon="phone"
            kicker={t('hero.device')}
            value={t('hero.deviceValue')}
            sub={`${t('hero.taken')} ${t('hero.takenValue')}`}
            className="max-lg:!hidden lg:-left-11 lg:top-[23%]"
            delay={1.5}
          />
          <div
            className="anim-tag absolute -bottom-5 left-2 flex items-baseline gap-2 bg-alert px-3 py-2 text-void shadow-[0_20px_50px_rgb(255_115_32/0.3)] sm:-bottom-8 sm:left-7 sm:gap-3 sm:px-4 sm:py-3"
            style={{ animationDelay: '2.3s' }}
          >
            <span className="font-display text-3xl font-bold leading-none sm:text-[40px]">{HERO_COUNT}</span>
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] sm:text-xs">
              {t('hero.count')}
            </span>
          </div>
        </div>
      </div>
      <figcaption className="mt-10 text-right font-mono text-[11px] uppercase tracking-[0.14em] text-muted sm:mt-[52px]">
        {t('hero.caption')}
      </figcaption>
    </figure>
  );
}
