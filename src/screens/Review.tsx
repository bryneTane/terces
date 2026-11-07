import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon, type IconName } from '../components/Icon.tsx';
import { PhotoFrame, PhotoView } from '../components/PhotoView.tsx';
import { ZoneLayer, type Tool } from '../components/ZoneLayer.tsx';
import { useI18n } from '../i18n.tsx';
import { DEFAULT_STYLE, stylesFor, type MaskStyle, type MaskStyles } from '../lib/mask.ts';
import type { PhotoSession, Zone } from '../lib/types.ts';
import { addManualZone, removeZone, resizeZone, toggleZone } from '../lib/zones.ts';

type Cat = Zone['category'];
const GROUPS: { cat: Cat; icon: IconName; group: string; item: string }[] = [
  { cat: 'face', icon: 'face', group: 'review.groupFace', item: 'review.itemFace' },
  { cat: 'text', icon: 'text', group: 'review.groupText', item: 'review.itemText' },
  { cat: 'plate', icon: 'plate', group: 'review.groupPlate', item: 'review.itemPlate' },
  { cat: 'person', icon: 'person', group: 'review.groupPerson', item: 'review.itemPerson' },
  { cat: 'manual', icon: 'draw', group: 'review.groupManual', item: 'review.itemManual' },
];

const STYLE_LABEL: Record<MaskStyle, string> = {
  blur: 'review.styleBlur',
  mosaic: 'review.styleMosaic',
  opaque: 'review.styleOpaque',
  emoji: 'review.styleEmoji',
};

/** Small preview of what a mask style looks like. */
function Swatch({ style }: { style: MaskStyle }) {
  const look: Record<MaskStyle, CSSProperties> = {
    blur: { background: 'radial-gradient(circle at 40% 40%, #a3b0bc, #4a5662 55%, #2a333c)' },
    mosaic: {
      backgroundImage: 'conic-gradient(#3a4652 25%, #6d7b88 0 50%, #2a333c 0 75%, #8593a0 0)',
      backgroundSize: '8px 8px',
    },
    opaque: { background: 'var(--color-mask)' },
    emoji: {},
  };
  return (
    <span
      aria-hidden="true"
      className="grid size-5 shrink-0 place-items-center border border-edge text-[13px] leading-none max-[380px]:hidden"
      style={look[style]}
    >
      {style === 'emoji' ? '😎' : null}
    </span>
  );
}

/** Zone groups with more entries than this start collapsed. */
const OPEN_UP_TO = 5;

/** Undo steps kept in memory. */
const HISTORY = 50;

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function Review({
  session,
  onCloak,
  onZones,
}: {
  session: PhotoSession;
  onCloak: (styles: MaskStyles) => void;
  onZones?: (zones: Zone[]) => void;
}) {
  const { t } = useI18n();
  const [styles, setStyles] = useState<MaskStyles>({});
  const styleOf = (c: Cat) => styles[c] ?? DEFAULT_STYLE;
  const [tool, setTool] = useState<Tool>('select');
  const [open, setOpen] = useState<Partial<Record<Cat, boolean>>>({});
  const [hover, setHover] = useState<string | null>(null);
  const history = useRef<Zone[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const m = session.metadata.length;
  const zones = session.zones;
  const editable = !!onZones && session.state === 'reviewing';
  const detected = zones.some((z) => z.kind === 'detected');
  const covered = zones.filter((z) => z.selected).length;
  const cloaking = session.state === 'cloaking';
  const present = GROUPS.filter((g) => zones.some((z) => z.category === g.cat));

  // Per category numbering, in list order: "Face 1", "Face 2"...
  const names = new Map<string, string>();
  for (const g of GROUPS)
    zones.filter((z) => z.category === g.cat).forEach((z, i) => names.set(z.id, t(g.item, { n: i + 1 })));
  const nameOf = (z: Zone) => names.get(z.id) ?? t(`cat.${z.category}`);

  const commit = (next: Zone[]) => {
    history.current = [...history.current.slice(-(HISTORY - 1)), zones];
    setCanUndo(true);
    onZones?.(next);
  };
  const undo = () => {
    const prev = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (prev) onZones?.(prev);
  };
  const undoRef = useRef(undo);
  useEffect(() => {
    undoRef.current = undo;
  });

  useEffect(() => {
    if (!editable) return;
    const key = (e: KeyboardEvent) => {
      if (typing(e.target) || e.altKey) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      } else if (!e.metaKey && !e.ctrlKey && k === 'v') setTool('select');
      else if (!e.metaKey && !e.ctrlKey && k === 'd') setTool('draw');
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [editable]);

  const toolBtn = (id: Tool, icon: IconName, label: string, kbd: string) => (
    <button
      type="button"
      aria-pressed={tool === id}
      onClick={() => setTool(id)}
      className={`flex min-h-10 items-center gap-2 px-3 font-mono whitespace-nowrap text-[12px] tracking-[0.1em] uppercase transition-colors ${tool === id ? 'bg-accent text-void' : 'text-soft hover:bg-raised hover:text-ink'}`}
    >
      <Icon name={icon} size={16} />
      {label}
      <kbd
        aria-hidden="true"
        className={`border px-1 max-sm:hidden font-mono text-[10px] ${tool === id ? 'border-void/40' : 'border-edge text-muted'}`}
      >
        {kbd}
      </kbd>
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-28 sm:px-8 sm:pt-8 lg:pb-16">
      <p className="kicker m-0">{t('review.title')}</p>
      <h1
        tabIndex={-1}
        className="font-display mt-1.5 mb-0 text-[26px] leading-tight font-semibold tracking-[-0.02em] sm:text-[34px]"
      >
        {t('review.heading')}
      </h1>

      <div className="mt-7 flex flex-wrap items-start gap-8">
        <section aria-label={t('review.title')} className="min-w-0 flex-[1_1_600px]">
          {editable && (
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div
                role="toolbar"
                aria-label={t('review.tools')}
                className="flex border border-line bg-panel p-1"
              >
                {toolBtn('select', 'pointer', t('review.toolSelect'), 'V')}
                {toolBtn('draw', 'draw', t('review.toolDraw'), 'D')}
                <span aria-hidden="true" className="mx-1 w-px bg-line" />
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  className="flex min-h-10 items-center gap-2 px-3 font-mono text-[12px] tracking-[0.1em] text-soft uppercase hover:bg-raised hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent"
                >
                  <Icon name="undo" size={16} />
                  {t('review.undo')}
                </button>
              </div>
              <span className="font-mono text-[11px] tracking-[0.1em] text-dim uppercase max-sm:hidden">
                {tool === 'draw' ? t('review.hintDraw') : t('review.hintSelect')}
              </span>
            </div>
          )}
          <PhotoFrame mode={editable && tool === 'draw' ? 'draw' : 'target'}>
            <PhotoView file={session.file}>
              <ZoneLayer
                zones={zones}
                width={session.width}
                height={session.height}
                tool={tool}
                hover={hover}
                onHover={setHover}
                nameOf={nameOf}
                {...(editable
                  ? {
                      onToggle: (id: string) => commit(toggleZone(zones, id)),
                      onAdd: (r) => commit(addManualZone(zones, r, session.width, session.height)),
                      onRemove: (id: string) => commit(removeZone(zones, id)),
                      onResize: (id: string, r) => {
                        const next = resizeZone(zones, id, r, session.width, session.height);
                        if (next !== zones) commit(next);
                      },
                    }
                  : {})}
              />
            </PhotoView>
          </PhotoFrame>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] tracking-[0.1em] text-dim uppercase">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="hatch size-3 border-2 border-alert" />
              {t('review.legendCover')}
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="size-3 border border-dashed border-accent" />
              {t('review.legendKeep')}
            </span>
            {detected && <span className="text-muted">{t('review.legendSwitch')}</span>}
          </div>
          {session.notice && (
            <p
              role="status"
              className="mt-4 border border-danger/60 bg-danger/5 px-4 py-3 text-sm text-danger"
              data-testid="manual-mode"
            >
              {t(`error.${session.notice.code}`)}
            </p>
          )}
          <p className="mt-3 mb-0 text-sm text-dim" data-testid="review-hint">
            {detected ? t('review.hint') : t('review.nothing')}
          </p>
        </section>

        <aside aria-label={t('review.listHead')} className="grid min-w-0 flex-[1_1_380px] gap-4">
          <div className="border border-line bg-panel">
            <div className="flex items-baseline justify-between px-5 pt-4 pb-3">
              <h2 className="label m-0">{t('review.listHead')}</h2>
              <span className="font-mono text-sm text-ink tabular-nums">
                <span className="text-alert">{covered}</span>/{zones.length}
              </span>
            </div>
            {GROUPS.map((g) => {
              const list = zones.filter((z) => z.category === g.cat);
              if (!list.length) return null;
              const isOpen = open[g.cat] ?? list.length <= OPEN_UP_TO;
              return (
                <div key={g.cat} className="border-t border-line">
                  <h3 className="m-0">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`zones-${g.cat}`}
                      onClick={() => setOpen((o) => ({ ...o, [g.cat]: !isOpen }))}
                      className="flex min-h-11 w-full items-center gap-2.5 px-5 font-mono text-[11px] font-normal tracking-[0.14em] text-dim uppercase hover:text-ink"
                    >
                      <span
                        aria-hidden="true"
                        className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      >
                        <Icon name="arrow" size={14} />
                      </span>
                      <span className="flex-1 text-left">{t(g.group)}</span>
                      {g.cat === 'person' && <span className="text-muted">{t('review.offDefault')}</span>}
                      <span aria-hidden="true" className="tabular-nums">
                        <span className="text-alert">{list.filter((z) => z.selected).length}</span>/
                        {list.length}
                      </span>
                    </button>
                  </h3>
                  <ul id={`zones-${g.cat}`} hidden={!isOpen} className="m-0 list-none p-0 pb-2">
                    {list.map((z) => {
                      const lit = hover === z.id;
                      return (
                        <li
                          key={z.id}
                          className={`flex items-center transition-colors ${lit ? 'bg-raised' : ''}`}
                          onMouseEnter={() => setHover(z.id)}
                          onMouseLeave={() => setHover(null)}
                        >
                          <button
                            type="button"
                            disabled={!editable}
                            aria-pressed={z.selected}
                            onClick={() => commit(toggleZone(zones, z.id))}
                            onFocus={() => setHover(z.id)}
                            onBlur={() => setHover(null)}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-5 text-left text-sm disabled:cursor-default"
                          >
                            <span className={z.selected ? 'text-alert' : 'text-accent'}>
                              <Icon name={g.icon} size={17} />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{nameOf(z)}</span>
                            <span
                              className={`border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${z.selected ? 'border-alert bg-alert text-void' : 'border-dashed border-accent text-accent'}`}
                            >
                              {z.selected ? t('review.stateCover') : t('review.stateKeep')}
                            </span>
                          </button>
                          {editable && z.kind === 'manual' && (
                            <button
                              type="button"
                              onClick={() => commit(removeZone(zones, z.id))}
                              className="mr-3 grid size-9 place-items-center text-dim hover:text-alert"
                              aria-label={`${t('review.stateRemove')} ${nameOf(z)}`}
                            >
                              <Icon name="close" size={16} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            <p className="m-0 flex items-center gap-3 border-t border-line px-5 py-3.5 text-[13px] text-dim">
              <span className="text-safe">
                <Icon name="lock" size={16} />
              </span>
              {m ? t('review.metaAlways', { count: m }) : t('review.metadataNone')}
            </p>
          </div>

          {present.length > 0 && (
            <div className="border border-line bg-panel px-5 pt-4 pb-5">
              <h2 className="label m-0">{t('review.maskLegend')}</h2>
              {present.map((g) => (
                <fieldset key={g.cat} className="m-0 mt-3 border-0 p-0">
                  <legend className="mb-1.5 p-0 font-mono text-[11px] tracking-[0.14em] text-dim uppercase">
                    {t(g.group)}
                  </legend>
                  <div className="grid grid-cols-4 gap-1.5">
                    {stylesFor(g.cat).map((s) => {
                      const on = styleOf(g.cat) === s;
                      return (
                        <label
                          key={s}
                          className={`flex min-h-11 cursor-pointer items-center gap-2 border px-2 py-1.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${on ? 'border-accent bg-accent/5 text-accent' : 'border-line text-soft hover:border-edge hover:text-ink'}`}
                        >
                          <input
                            type="radio"
                            name={`mask-${g.cat}`}
                            value={s}
                            checked={on}
                            onChange={() => setStyles((prev) => ({ ...prev, [g.cat]: s }))}
                            aria-label={t(STYLE_LABEL[s])}
                            className="sr-only"
                          />
                          <Swatch style={s} />
                          <span aria-hidden="true" className="truncate text-[13px] font-medium">
                            {t(STYLE_LABEL[s])}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              <p className="mt-3 mb-0 text-[13px] text-dim">{t('review.styleNote')}</p>
            </div>
          )}

          <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-void via-void/95 to-transparent px-4 pt-6 pb-[max(12px,env(safe-area-inset-bottom))] lg:static lg:bg-none lg:p-0">
            <button
              type="button"
              onClick={() => onCloak(styles)}
              disabled={cloaking}
              aria-busy={cloaking || undefined}
              className="btn-primary min-h-[52px] w-full"
            >
              {cloaking ? (
                <>
                  <span
                    aria-hidden="true"
                    className="inline-block size-3 animate-spin border-2 border-current border-t-transparent"
                  />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <Icon name="shield" />
                  {t('review.cloakN', { count: covered })}
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
