import { useRef, useState, type PointerEvent } from 'react';
import { useI18n } from '../i18n.tsx';
import type { Rect, Zone } from '../lib/types.ts';
import { hitTest } from '../lib/zones.ts';

const pct = (r: Rect, w: number, h: number) => ({
  left: `${(r.x / w) * 100}%`,
  top: `${(r.y / h) * 100}%`,
  width: `${(r.w / w) * 100}%`,
  height: `${(r.h / h) * 100}%`,
});

/** Screen px a pointer must travel before a tap becomes a drawn rectangle. */
export const DRAG_THRESHOLD = 8;

export type Tool = 'select' | 'draw';

export interface ZoneLayerProps {
  zones: Zone[];
  width: number;
  height: number;
  onToggle?: (id: string) => void;
  onAdd?: (rect: Rect) => void;
  onRemove?: (id: string) => void;
  /**
   * Drag a corner handle of the hovered zone to resize it, or drag a drawn zone to move it.
   * Called once, on release.
   */
  onResize?: (id: string, rect: Rect) => void;
  /** `draw`: taps do nothing, only drags (draw a zone). Default `select`: taps toggle, drags draw. */
  tool?: Tool;
  /** Zone highlighted from outside (the findings list), and hover reporting back. */
  hover?: string | null;
  onHover?: (id: string | null) => void;
  /** Accessible name of each zone, e.g. "Face 2". */
  nameOf?: (z: Zone) => string;
}

/**
 * Zones over the photo. Display-only without handlers. With handlers: a tap toggles the smallest
 * zone under it, a drag on a drawn zone moves it, a drag elsewhere draws a manual zone, manual
 * zones have a remove control. Zones are also
 * focusable buttons so the keyboard can toggle them.
 */
export function ZoneLayer({
  zones,
  width,
  height,
  onToggle,
  onAdd,
  onRemove,
  onResize,
  tool = 'select',
  hover = null,
  onHover,
  nameOf,
}: ZoneLayerProps) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const start = useRef<{
    id: number;
    sx: number;
    sy: number;
    x: number;
    y: number;
    /** Drawn zone the drag started on: the drag moves it. */
    move?: Zone;
  } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  /** Corner drag in progress: the opposite corner stays fixed. */
  const sizing = useRef<{ id: number; zone: string; fx: number; fy: number } | null>(null);
  const [live, setLive] = useState<{ id: string; rect: Rect } | null>(null);
  const interactive = !!(onToggle || onAdd);
  if (!width || !height) return null;

  const toImage = (e: PointerEvent) => {
    const b = root.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / (b.width || 1)) * width,
      y: ((e.clientY - b.top) / (b.height || 1)) * height,
    };
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = toImage(e);
    const hit = tool === 'select' ? hitTest(zones, p.x, p.y) : null;
    const move = hit?.kind === 'manual' && onResize ? hit : undefined;
    start.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ...p, ...(move ? { move } : {}) };
    root.current?.setPointerCapture?.(e.pointerId);
    // Touch has no hover: the touched zone shows its resize handles.
    if (e.pointerType !== 'mouse' && tool === 'select') onHover?.(hit?.id ?? null);
  };
  const startResize = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const corner = e.currentTarget.dataset.handle ?? '';
    const z = zones.find((q) => q.id === e.currentTarget.dataset.zone);
    if (!z) return;
    e.stopPropagation();
    const r = z.rect;
    sizing.current = {
      id: e.pointerId,
      zone: z.id,
      fx: corner.includes('w') ? r.x + r.w : r.x,
      fy: corner.includes('n') ? r.y + r.h : r.y,
    };
    setLive({ id: z.id, rect: r });
    root.current?.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const z = sizing.current;
    if (z && z.id === e.pointerId) {
      const p = toImage(e);
      const x = Math.max(0, Math.min(width, p.x));
      const y = Math.max(0, Math.min(height, p.y));
      setLive({
        id: z.zone,
        rect: { x: Math.min(z.fx, x), y: Math.min(z.fy, y), w: Math.abs(x - z.fx), h: Math.abs(y - z.fy) },
      });
      return;
    }
    const s = start.current;
    if (!s || s.id !== e.pointerId) {
      // Over a handle: keep the zone hovered so its handles stay put.
      if (e.target instanceof HTMLElement && e.target.dataset.handle) return;
      if (onHover && tool === 'select' && e.pointerType === 'mouse') {
        const p = toImage(e);
        onHover(hitTest(zones, p.x, p.y)?.id ?? null);
      }
      return;
    }
    const far = Math.hypot(e.clientX - s.sx, e.clientY - s.sy) >= DRAG_THRESHOLD;
    if (s.move) {
      if (!far && live?.id !== s.move.id) return;
      const p = toImage(e);
      const r = s.move.rect;
      const x = Math.max(0, Math.min(width - r.w, r.x + p.x - s.x));
      const y = Math.max(0, Math.min(height - r.h, r.y + p.y - s.y));
      setLive({ id: s.move.id, rect: { ...r, x, y } });
      return;
    }
    if (!onAdd) return;
    if (!draft && !far) return;
    const p = toImage(e);
    setDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const z = sizing.current;
    if (z && z.id === e.pointerId) {
      sizing.current = null;
      if (live) onResize?.(live.id, live.rect);
      setLive(null);
      return;
    }
    const s = start.current;
    start.current = null;
    if (!s || s.id !== e.pointerId) return;
    if (s.move && live?.id === s.move.id) {
      onResize?.(live.id, live.rect);
      setLive(null);
      return;
    }
    if (draft) {
      onAdd?.(draft);
      setDraft(null);
      return;
    }
    if (tool === 'draw') return;
    const hit = hitTest(zones, s.x, s.y);
    if (hit) onToggle?.(hit.id);
  };
  const onCancel = () => {
    start.current = null;
    sizing.current = null;
    setLive(null);
    setDraft(null);
  };
  const found = zones.find((z) => z.id === hover);
  const hovered = found && live?.id === found.id ? { ...found, rect: live.rect } : found;
  const name = (z: Zone) => nameOf?.(z) ?? t(`cat.${z.category}`);

  return (
    <div
      ref={root}
      data-testid="zone-layer"
      className={`absolute inset-0 ${interactive ? 'pointer-events-auto cursor-crosshair' : ''}`}
      style={interactive ? { touchAction: 'none' } : undefined}
      onPointerDown={interactive ? onDown : undefined}
      onPointerMove={interactive ? onMove : undefined}
      onPointerUp={interactive ? onUp : undefined}
      onPointerCancel={interactive ? onCancel : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
    >
      {zones.map((z) => {
        const lit = z.id === hover;
        const rect = live?.id === z.id ? live.rect : z.rect;
        const handles = !!onResize && tool === 'select' && (lit || live?.id === z.id);
        const glow = lit
          ? z.selected
            ? '0 0 0 2px var(--color-alert), 0 0 24px rgb(255 115 32 / 0.6)'
            : '0 0 0 2px var(--color-accent), 0 0 24px rgb(141 232 255 / 0.5)'
          : undefined;
        return (
          <div
            key={z.id}
            data-testid="zone"
            data-category={z.category}
            data-selected={z.selected}
            style={{ ...pct(rect, width, height), boxShadow: glow }}
            className={`absolute transition-shadow ${onResize && tool === 'select' && z.kind === 'manual' ? 'cursor-move' : ''} ${z.category === 'face' ? 'rounded-[50%]' : ''} ${z.selected ? 'hatch border-2 border-alert' : `border border-dashed border-accent/70 ${lit ? 'bg-accent/10' : ''}`}`}
          >
            {interactive ? (
              <button
                type="button"
                aria-pressed={z.selected}
                aria-label={`${name(z)}: ${z.selected ? t('review.zoneCovered') : t('review.zoneVisible')}`}
                className="pointer-events-none absolute inset-0 focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => onToggle?.(z.id)}
                onFocus={() => onHover?.(z.id)}
                onBlur={() => onHover?.(null)}
              />
            ) : null}
            {handles &&
              (['nw', 'ne', 'sw', 'se'] as const).map((c) => (
                <span
                  key={c}
                  data-handle={c}
                  data-zone={z.id}
                  data-testid="zone-handle"
                  aria-hidden="true"
                  onPointerDown={startResize}
                  // Big enough for a finger; with a mouse just the visible square, so the inside
                  // of a small zone stays a move/select area.
                  className={`pointer-events-auto absolute z-10 grid size-6 place-items-center pointer-fine:size-3 ${c[0] === 'n' ? '-top-3 pointer-fine:-top-1.5' : '-bottom-3 pointer-fine:-bottom-1.5'} ${c[1] === 'w' ? '-left-3 pointer-fine:-left-1.5' : '-right-3 pointer-fine:-right-1.5'} ${c === 'nw' || c === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}`}
                >
                  <span
                    className={`pointer-events-none size-2.5 border-2 bg-void ${z.selected ? 'border-alert' : 'border-accent'}`}
                  />
                </span>
              ))}
            {!interactive && !z.selected && (
              <span className="absolute -top-5 left-0 bg-void/80 px-1 font-mono text-[10px] whitespace-nowrap text-accent uppercase">
                {t(`cat.${z.category}`)} · {t('review.zoneVisible')}
              </span>
            )}
            {onRemove && z.kind === 'manual' && (
              <button
                type="button"
                aria-label={t('review.removeZone')}
                data-testid="zone-remove"
                className="pointer-events-auto absolute -top-8 right-0 z-20 grid size-6 place-items-center rounded-full bg-alert font-mono text-xs text-void"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onRemove(z.id)}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {hovered && interactive && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -mt-1.5 -translate-y-full px-2 py-0.5 font-mono text-[11px] font-medium tracking-[0.08em] whitespace-nowrap text-void uppercase ${hovered.selected ? 'bg-alert' : 'bg-accent'}`}
          style={{ left: `${(hovered.rect.x / width) * 100}%`, top: `${(hovered.rect.y / height) * 100}%` }}
        >
          {name(hovered)} · {hovered.selected ? t('review.stateCover') : t('review.stateKeep')}
        </span>
      )}
      {draft && (
        <div
          data-testid="zone-draft"
          style={pct(draft, width, height)}
          className="absolute border-2 border-dashed border-alert bg-alert/15"
        />
      )}
    </div>
  );
}
