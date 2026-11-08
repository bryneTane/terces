import { useState } from 'react';
import { Icon } from '../components/Icon.tsx';
import { Logo } from '../components/Icon.tsx';
import { PhotoView } from '../components/PhotoView.tsx';
import { useQuality } from '../fx/QualityProvider.tsx';
import { useI18n } from '../i18n.tsx';
import { countByCategory, findingsCount } from '../lib/findings.ts';
import { objectUrlFor } from '../lib/objectUrl.ts';
import type { PhotoSession } from '../lib/types.ts';
import { cloakedFilename, download, shareOrDownload } from '../lib/share.ts';
import { CARD_FILENAME, renderShareCard } from '../lib/shareCard.ts';

const Spinner = () => (
  <span
    aria-hidden="true"
    className="inline-block size-3 animate-spin border-2 border-current border-t-transparent"
  />
);

export function Result({
  session,
  onStartOver,
  onEditZones,
}: {
  session: PhotoSession;
  onStartOver: () => void;
  onEditZones?: () => void;
}) {
  const { t, locale } = useI18n();
  const { tier } = useQuality();
  const [pos, setPos] = useState(50);
  const [busy, setBusy] = useState<'file' | 'card' | 'card-download' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filename] = useState(() => cloakedFilename());
  const result = session.result;
  if (!result) return null;
  const s = result.summary;
  const total = findingsCount(session.metadata, session.visual);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
  const before = session.file ? objectUrlFor(session.file) : null;

  // Numbers only: the card never sees the photo or any text read in it.
  const card = () =>
    renderShareCard({
      count: total,
      breakdown: { metadata: session.metadata.length, ...countByCategory(session.visual) },
      locale,
    });

  const save = async (what: 'file' | 'card' | 'card-download') => {
    setBusy(what);
    try {
      if (what === 'card-download') {
        download(await card(), CARD_FILENAME);
        setNote(t('result.downloaded'));
        return;
      }
      const outcome =
        what === 'file'
          ? await shareOrDownload(result.blob, filename)
          : await shareOrDownload(await card(), CARD_FILENAME);
      setNote(outcome === 'downloaded' ? t('result.downloaded') : null);
    } finally {
      setBusy(null);
    }
  };

  const done = [
    { key: 'meta', label: t('result.doneMeta'), n: s.metadataRemoved, always: true },
    { key: 'faces', label: t('result.doneFaces'), n: s.faces },
    { key: 'text', label: t('result.doneText'), n: s.text },
    { key: 'plates', label: t('result.donePlates'), n: s.plates },
    { key: 'manual', label: t('result.doneManual'), n: s.manual },
  ].filter((r) => r.always || r.n > 0);

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-16 sm:px-8 sm:pt-8">
      <div className="flex flex-wrap items-start gap-8">
        <section aria-label={t('result.compare')} className="min-w-0 flex-[1_1_600px]">
          <div className="rulers">
            <div data-compare className="relative border border-edge bg-deep">
              {/* The cloaked image is revealed by a cold sweep, once; instant on the static tier. */}
              <div className={tier === 'static' ? '' : 'decloak relative'} data-testid="result-image">
                <PhotoView src={result.url} alt={t('result.after')}>
                  {before && (
                    <>
                      <img
                        src={before}
                        alt=""
                        draggable={false}
                        className="absolute inset-0 block size-full object-contain"
                        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
                      />
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent shadow-[0_0_16px_var(--color-accent)]"
                        style={{ left: `${pos}%` }}
                      >
                        <span className="absolute top-1/2 left-1/2 grid size-10 -translate-1/2 place-items-center border border-accent bg-void/90 text-accent">
                          <Icon name="compare" size={18} />
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute top-3 left-3 bg-void/85 px-2 py-0.5 font-mono text-[11px] tracking-[0.14em] text-alert uppercase"
                      >
                        {t('result.before')}
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute top-3 right-3 bg-void/85 px-2 py-0.5 font-mono text-[11px] tracking-[0.14em] text-safe uppercase"
                      >
                        {t('result.after')}
                      </span>
                    </>
                  )}
                </PhotoView>
              </div>
              {before && (
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pos}
                  onChange={(e) => setPos(Number(e.target.value))}
                  aria-label={t('result.compare')}
                  className="absolute inset-0 size-full cursor-ew-resize opacity-0"
                />
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.1em] text-dim uppercase">
            {before && <span>{t('result.drag')}</span>}
            <span className="normal-case">{t('result.burned')}</span>
          </div>
          {session.downscaled && (
            <p className="mt-3 mb-0 text-xs text-muted">
              {t('result.downscaled', { w: result.width, h: result.height })}
            </p>
          )}
        </section>

        <aside aria-label={t('result.title')} className="grid min-w-0 flex-[1_1_380px] gap-4">
          <div className="border border-line bg-panel p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <span
                className={`anim-ring grid size-14 shrink-0 place-items-center rounded-full border-2 ${result.verified ? 'border-safe text-safe' : 'border-alert text-alert'}`}
              >
                <Icon name={result.verified ? 'shieldCheck' : 'shield'} size={26} />
              </span>
              <div>
                <p className="kicker m-0">{t('result.title')}</p>
                <h1
                  tabIndex={-1}
                  className="font-display mt-1 mb-0 text-[26px] leading-tight font-semibold tracking-[-0.02em]"
                >
                  {t('result.heading')}
                </h1>
              </div>
            </div>
            {result.verified ? (
              <p className="mt-3 mb-0 text-dim">{t('result.ready')}</p>
            ) : (
              <p
                role="alert"
                className="mt-4 mb-0 border border-danger/60 bg-danger/5 px-4 py-3 text-sm text-danger"
              >
                {t('error.verify-failed')}
              </p>
            )}
            <p className="sr-only" data-testid="summary">
              {t('result.summary', { m: s.metadataRemoved, f: s.faces, t: s.text + s.plates })}
            </p>
            <ul aria-hidden="true" className="mt-5 mb-0 list-none border border-line p-0">
              {done.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span className="text-safe">
                    <Icon name="check" size={16} strokeWidth={2.2} />
                  </span>
                  <span className="flex-1">{r.label}</span>
                  <span className="font-mono text-ink tabular-nums">{r.n}</span>
                </li>
              ))}
              {result.verified && (
                <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="text-safe">
                    <Icon name="check" size={16} strokeWidth={2.2} />
                  </span>
                  <span className="flex-1">{t('result.doneVerified')}</span>
                  <span className="font-mono text-[11px] tracking-[0.14em] text-safe uppercase">
                    {t('result.clean')}
                  </span>
                </li>
              )}
            </ul>

            {result.verified && (
              <>
                <div className="mt-4 flex items-center gap-3 border border-dashed border-edge px-4 py-3">
                  <span className="text-accent">
                    <Icon name="file" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[13px] text-ink">{filename}</span>
                    <span className="block font-mono text-[11px] text-dim">
                      {t('result.fileInfo', { w: result.width, h: result.height })}
                    </span>
                  </span>
                </div>
                <div className={`mt-4 grid gap-3 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <button
                    type="button"
                    onClick={() => save('file')}
                    disabled={busy !== null}
                    className="btn-primary min-h-[52px]"
                  >
                    {busy === 'file' ? <Spinner /> : <Icon name={canShare ? 'share' : 'download'} />}
                    {canShare ? t('result.share') : t('result.download')}
                  </button>
                  {canShare && (
                    <button
                      type="button"
                      onClick={() => download(result.blob, filename)}
                      className="btn-ghost min-h-[52px]"
                    >
                      <Icon name="download" />
                      {t('result.download')}
                    </button>
                  )}
                </div>
              </>
            )}
            {note && (
              <p role="status" className="mt-3 mb-0 text-xs text-dim">
                {note}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {onEditZones && (
                <button type="button" onClick={onEditZones} className="btn-ghost">
                  <Icon name="edit" size={16} />
                  {t('result.editZones')}
                </button>
              )}
              <button
                type="button"
                onClick={onStartOver}
                className={`btn-ghost ${onEditZones ? '' : 'col-span-2'}`}
              >
                <Icon name="restart" size={16} />
                {t('result.newPhoto')}
              </button>
            </div>
          </div>

          {
            <div className="flex flex-wrap items-center gap-5 border border-line bg-panel p-5">
              <div
                aria-hidden="true"
                className="relative grid aspect-[4/5] w-24 shrink-0 content-between border border-edge bg-void p-2.5"
              >
                <Logo size={14} />
                <span>
                  <span className="font-display block text-[30px] leading-none font-bold text-alert">
                    {total}
                  </span>
                  <span className="mt-1 block font-mono text-[7px] leading-tight tracking-[0.08em] text-soft uppercase">
                    {t('intel.things', { count: total })}
                  </span>
                </span>
              </div>
              <div className="min-w-0 flex-[1_1_180px]">
                <h2 className="font-display m-0 text-lg font-semibold">{t('result.warnTitle')}</h2>
                <p className="mt-1 mb-3 text-[13px] text-dim">{t('result.warnBody', { count: total })}</p>
                <div className={`grid gap-2 ${canShare ? 'sm:grid-cols-[1fr_auto]' : ''}`}>
                  <button
                    type="button"
                    onClick={() => save('card')}
                    disabled={busy !== null}
                    className="btn-ghost w-full"
                  >
                    {busy === 'card' ? (
                      <Spinner />
                    ) : (
                      <Icon name={canShare ? 'share' : 'download'} size={16} />
                    )}
                    {t('result.shareWarning')}
                  </button>
                  {/* The share sheet has no "save" on every device: the card can always be downloaded. */}
                  {canShare && (
                    <button
                      type="button"
                      onClick={() => save('card-download')}
                      disabled={busy !== null}
                      className="btn-ghost"
                      aria-label={t('result.downloadWarning')}
                    >
                      {busy === 'card-download' ? <Spinner /> : <Icon name="download" size={16} />}
                      {t('result.download')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          }
        </aside>
      </div>
    </div>
  );
}
