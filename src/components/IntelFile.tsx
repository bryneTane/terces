import { useI18n } from '../i18n.tsx';
import { useQuality } from '../fx/QualityProvider.tsx';
import { useRollUp, useTyped } from '../fx/useReveal.ts';
import { countByCategory, findingsCount } from '../lib/findings.ts';
import { displayValue } from '../lib/metadata.ts';
import type { MetadataFinding, MetadataGroup, VisualFinding } from '../lib/types.ts';
import { Icon, type IconName } from './Icon.tsx';
import { MiniMap } from './MiniMap.tsx';

/** Quotes shown before "+k more" (dense text). */
export const MAX_QUOTES = 8;
/** Segments in the exposure meter, and the count that fills it. */
const METER = 12;
const METER_FULL = 18;

const GROUP_ICON: Record<MetadataGroup, IconName> = {
  location: 'pin',
  datetime: 'clock',
  device: 'phone',
  lens: 'camera',
  software: 'chip',
  identity: 'id',
  other: 'file',
};

export function exposureLevel(total: number): 'Low' | 'Medium' | 'High' {
  return total >= 9 ? 'High' : total >= 4 ? 'Medium' : 'Low';
}

function Typed({ text, animated, delay }: { text: string; animated: boolean; delay: number }) {
  const shown = useTyped(text, animated, delay);
  return (
    <span aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}

const panel = 'border border-line bg-panel';

/**
 * The scan report. Every listed item carries how many findings it stands for (`data-count`), and
 * the headline is their sum, so the number shown always matches what is listed.
 */
export function IntelFile({
  metadata,
  visual,
  done,
}: {
  metadata: MetadataFinding[];
  visual: VisualFinding[];
  done: boolean;
}) {
  const { t, locale } = useI18n();
  const { tier } = useQuality();
  const animated = tier !== 'static';
  const total = findingsCount(metadata, visual);
  const shown = useRollUp(total, animated);
  const by = countByCategory(visual);

  const quotes = visual.filter((f) => (f.category === 'text' || f.category === 'plate') && f.text);
  const unread = visual.filter((f) => (f.category === 'text' || f.category === 'plate') && !f.text).length;
  const visibleQuotes = quotes.slice(0, MAX_QUOTES);
  const hidden = quotes.length - visibleQuotes.length;
  const location = metadata.find((m) => m.group === 'location');
  const level = exposureLevel(total);
  const filled = Math.min(METER, Math.ceil((total / METER_FULL) * METER));

  const cats = [
    {
      key: 'metadata',
      icon: 'chip',
      n: metadata.length,
      label: t('stage.metadata'),
      sr: t('card.metadata', { count: metadata.length }),
      row: false,
    },
    {
      key: 'face',
      icon: 'face',
      n: by.face,
      label: t('stage.face'),
      sr: t('card.face', { count: by.face }),
      row: true,
    },
    {
      key: 'text',
      icon: 'text',
      n: by.text,
      label: t('stage.text'),
      sr: t('card.text', { count: by.text }),
      row: false,
    },
    {
      key: 'person',
      icon: 'person',
      n: by.person,
      label: t('stage.person'),
      sr: t('card.person', { count: by.person }),
      row: true,
    },
    {
      key: 'plate',
      icon: 'plate',
      n: by.plate,
      label: t('stage.plate'),
      sr: t('card.plate', { count: by.plate }),
      row: false,
    },
  ] as const;

  return (
    <section className="grid gap-4" aria-live="polite" data-testid="intel-file">
      <div className={`${panel} relative p-5 sm:p-6`}>
        <span
          aria-hidden="true"
          className="absolute -top-px -right-px size-3.5 border-t-2 border-r-2 border-alert"
        />
        <p className="label m-0">{t('intel.title')}</p>
        <div data-testid="intel-count" data-total={total}>
          {total ? (
            <>
              <div aria-hidden="true" className="mt-2.5 flex items-end gap-4">
                <span className="font-display text-[72px] leading-[0.9] font-bold tracking-[-0.04em] text-alert tabular-nums sm:text-[96px]">
                  {shown}
                </span>
                <span className="max-w-[11rem] pb-1.5 text-lg leading-snug font-medium">
                  {t('intel.things', { count: total })}
                </span>
              </div>
              <span className="sr-only">{t('intel.headline', { count: total })}</span>
            </>
          ) : (
            <p className="mt-2 mb-0 text-base text-dim">{done ? t('intel.none') : t('intel.searching')}</p>
          )}
        </div>
        {total > 0 && (
          <div className="mt-5">
            <div className="flex justify-between font-mono text-[11px] tracking-[0.14em] uppercase">
              <span className="text-dim">{t('intel.exposure')}</span>
              <span className={level === 'Low' ? 'text-accent' : 'text-alert'}>
                {t(`intel.level${level}`)}
              </span>
            </div>
            <div aria-hidden="true" className="mt-2 grid grid-cols-12 gap-[3px]">
              {Array.from({ length: METER }, (_, i) => (
                <span
                  key={i}
                  className="anim-grow h-2.5"
                  style={{
                    background: i < filled ? (i < 6 ? '#ff9a5c' : 'var(--color-alert)') : 'var(--color-line)',
                    animationDelay: `${0.2 + i * 0.05}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <ul className="mt-5 mb-0 grid list-none grid-cols-5 gap-px border border-line bg-line p-0">
          {cats.map((c) => (
            <li
              key={c.key}
              {...(c.row ? { 'data-testid': 'intel-row', 'data-count': c.n } : {})}
              className={`bg-deep px-1 py-3 text-center ${c.n ? (c.key === 'person' ? 'text-accent' : 'text-alert') : 'text-muted'}`}
            >
              <span aria-hidden="true">
                <Icon name={c.icon} size={20} className="mx-auto" />
                <span className="font-display mt-1.5 block text-[22px] font-semibold text-ink">{c.n}</span>
                <span className="block truncate font-mono text-[10px] tracking-[0.06em] text-dim uppercase">
                  {c.label}
                </span>
              </span>
              <span className="sr-only">{c.sr}</span>
            </li>
          ))}
        </ul>
      </div>

      {location?.geo && (
        <div className={`${panel} flex flex-wrap`}>
          <div className="w-full shrink-0 border-line sm:w-[200px] sm:border-r">
            <MiniMap lat={location.geo.lat} lon={location.geo.lon} />
          </div>
          <div className="min-w-0 flex-1 p-5">
            <p className="label m-0">{t('intel.locationHead')}</p>
            {location.geo.place && (
              <p className="font-display mt-2 mb-0 text-2xl leading-tight font-semibold">
                {location.geo.place}
              </p>
            )}
            <p className="mt-1.5 mb-0 font-mono text-[13px] text-soft">
              {location.geo.lat.toFixed(4)}, {location.geo.lon.toFixed(4)}
            </p>
            <p className="mt-3 mb-0 text-[13px] text-dim">{t('intel.locationNote')}</p>
          </div>
        </div>
      )}

      <div className={panel}>
        <h2 className="label m-0 px-5 pt-4 pb-2.5">
          {t('intel.metaHead')} · {metadata.length}
        </h2>
        {metadata.length ? (
          <ul className="m-0 list-none p-0">
            {metadata.map((m, i) => (
              <li
                key={m.group}
                data-testid="intel-row"
                data-count={1}
                className="flex items-center gap-3.5 border-t border-[#13283a] px-5 py-2.5 hover:bg-[#0c1b29]"
              >
                <span className="text-alert">
                  <Icon name={GROUP_ICON[m.group]} />
                </span>
                <span className="w-[6.5rem] shrink-0 font-mono text-[11px] tracking-[0.1em] text-dim uppercase">
                  {t(m.label)}
                </span>
                <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                  <Typed
                    text={displayValue(m, locale, (place) => t('intel.near', { place }))}
                    animated={animated}
                    delay={i * 120}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid gap-2 px-5 pb-4 text-sm" data-testid="metadata-none">
            <p className="m-0 text-ink">{t('intel.metaNone')}</p>
            <p className="m-0 text-xs text-dim">{t('intel.iosTip')}</p>
          </div>
        )}
      </div>

      {(quotes.length > 0 || unread > 0) && (
        <div className={`${panel} px-5 pt-4 pb-5`}>
          <h2 className="label m-0">
            {t('intel.readHead')} · {quotes.length + unread}
          </h2>
          <ul className="mt-3 mb-0 flex list-none flex-wrap gap-2 p-0">
            {visibleQuotes.map((q) => (
              <li
                key={q.id}
                data-testid="intel-row"
                data-count={1}
                className="border border-alert px-2.5 py-1 font-mono text-xs tracking-[0.06em] text-[#ffd2b8]"
              >
                {q.category === 'plate' && <span className="sr-only">{t('intel.plate')}: </span>}
                <q>{q.text}</q>
              </li>
            ))}
            {hidden > 0 && (
              <li
                data-testid="intel-row"
                data-count={hidden}
                className="border border-dashed border-edge px-2.5 py-1 font-mono text-xs text-dim"
              >
                {t('intel.more', { count: hidden })}
              </li>
            )}
            {unread > 0 && (
              <li
                data-testid="intel-row"
                data-count={unread}
                className="border border-dashed border-edge px-2.5 py-1 font-mono text-xs text-dim"
              >
                {t('intel.unread', { count: unread })}
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
