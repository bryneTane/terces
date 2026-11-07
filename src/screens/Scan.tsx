import { Icon } from '../components/Icon.tsx';
import { IntelFile } from '../components/IntelFile.tsx';
import { PhotoFrame, PhotoView } from '../components/PhotoView.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { ScanOverlay } from '../components/ScanOverlay.tsx';
import { useI18n } from '../i18n.tsx';
import type { PhotoSession } from '../lib/types.ts';
import type { ScannerStatus } from '../state/usePipeline.ts';

const STAGES = ['metadata', 'face', 'text', 'person', 'plate'] as const;

function formatBytes(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function Scan({
  session,
  scanner,
  onSkip,
  onContinue,
  onRestart,
}: {
  session: PhotoSession;
  scanner: ScannerStatus;
  onSkip: () => void;
  onContinue: () => void;
  onRestart?: () => void;
}) {
  const { t } = useI18n();
  const done = session.state === 'scanned';
  const file = session.file;
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-28 sm:px-8 sm:pt-8 lg:pb-16" aria-busy={!done}>
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div>
          <p className="kicker m-0">{done ? t('scan.done') : t('scan.title')}</p>
          <h1
            tabIndex={-1}
            className="font-display mt-1.5 mb-0 text-[26px] leading-tight font-semibold tracking-[-0.02em] sm:text-[34px]"
          >
            {done ? t('scan.heading') : t('scan.headingWorking')}
          </h1>
        </div>
        <ul aria-label={t('scan.stages')} className="m-0 flex list-none flex-wrap gap-2 p-0">
          {STAGES.map((s) => (
            <li
              key={s}
              className="flex items-center gap-1.5 border border-line bg-panel px-2.5 py-1.5 font-mono text-[11px] tracking-[0.1em] text-soft uppercase"
            >
              {done ? (
                <span className="text-safe">
                  <Icon name="check" size={15} strokeWidth={2.2} />
                </span>
              ) : (
                <span aria-hidden="true" className="anim-pulse size-1.5 bg-alert" />
              )}
              {t(`stage.${s}`)}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-7 flex flex-wrap items-start gap-8">
        <section aria-label={t('steps.scan')} className="min-w-0 flex-[1_1_600px]">
          <PhotoFrame>
            <PhotoView file={file}>
              <ScanOverlay
                findings={session.visual}
                width={session.width}
                height={session.height}
                active={!done}
              />
            </PhotoView>
          </PhotoFrame>
          <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.1em] text-dim uppercase">
            <span className="flex flex-wrap gap-x-5 gap-y-2">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 border-2 border-alert" />
                {t('scan.legendCover')}
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 border-2 border-accent" />
                {t('scan.legendPeople')}
              </span>
            </span>
            {file && session.width > 0 && (
              <span className="normal-case">
                {file.name} · {session.width} × {session.height} · {formatBytes(file.size)}
              </span>
            )}
          </div>
          {session.state === 'decoding' && (
            <p className="mt-3 font-mono text-xs text-muted">{t('scan.decoding')}</p>
          )}
          {!scanner.ready && !done && (
            <div className="mt-4">
              <ProgressBar
                value={scanner.progress}
                label={t('scan.loading', { pct: Math.round(scanner.progress * 100) })}
              />
            </div>
          )}
        </section>

        <aside aria-label={t('intel.title')} className="grid min-w-0 flex-[1_1_400px] gap-4">
          <IntelFile metadata={session.metadata} visual={session.visual} done={done} />
          <div className="fixed inset-x-0 bottom-0 z-10 flex gap-3 bg-gradient-to-t from-void via-void/95 to-transparent px-4 pt-6 pb-[max(12px,env(safe-area-inset-bottom))] lg:static lg:bg-none lg:p-0 lg:pt-1">
            {done ? (
              <button type="button" onClick={onContinue} className="btn-primary min-h-[52px] flex-1">
                {t('scan.continue')}
                <Icon name="arrow" />
              </button>
            ) : (
              // Always available, including while models load: cleaning never waits for the scanner.
              <button type="button" onClick={onSkip} className="btn-ghost min-h-[52px] flex-1">
                {t('scan.skip')}
              </button>
            )}
            {onRestart && (
              <button type="button" onClick={onRestart} className="btn-ghost min-h-[52px]">
                <Icon name="restart" size={17} />
                <span className="max-sm:sr-only">{t('scan.other')}</span>
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
