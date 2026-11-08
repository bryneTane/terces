import { Icon } from '../components/Icon.tsx';
import { IntelFile } from '../components/IntelFile.tsx';
import { PhotoFrame, PhotoView } from '../components/PhotoView.tsx';
import { ScanOverlay } from '../components/ScanOverlay.tsx';
import { useI18n } from '../i18n.tsx';
import type { PhotoSession } from '../lib/types.ts';
import type { ScannerStatus } from '../state/usePipeline.ts';
import type { Stage } from '../worker/protocol.ts';

const STAGES = ['metadata', 'face', 'text', 'person', 'plate'] as const;
/** Scan steps in the order they run, for the overall progress; the first is opening the photo. */
const STEPS = ['open', 'face', 'text-det', 'text-rec', 'person', 'plate'] as const;
const CHIP: Record<(typeof STEPS)[number], number> = {
  open: 0,
  face: 1,
  'text-det': 2,
  'text-rec': 2,
  person: 3,
  plate: 4,
};

/** What is happening now, and how far the whole scan has got (0..1). */
export function scanProgress(
  session: Pick<PhotoSession, 'id' | 'state'>,
  scanner: ScannerStatus,
): { step: (typeof STEPS)[number] | 'loading'; value: number; part?: { done: number; total: number } } {
  if (!scanner.ready && session.state !== 'decoding') return { step: 'loading', value: scanner.progress };
  const s = scanner.step?.id === session.id ? scanner.step : undefined;
  const step = (s && STEPS.includes(s.stage as never) ? s.stage : 'open') as (typeof STEPS)[number];
  const within = s?.part ? s.part.done / s.part.total : 0;
  return { step, value: (STEPS.indexOf(step) + within) / STEPS.length, part: s?.part };
}

const isStage = (s: string): s is Stage => s !== 'open';

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
  const now = scanProgress(session, scanner);
  const current = done ? STAGES.length : now.step === 'loading' ? 0 : CHIP[now.step];
  const pct = Math.round(now.value * 100);
  const status =
    now.step === 'loading'
      ? t('scan.loading', { pct })
      : now.step === 'text-rec' && now.part
        ? t('scan.now.readers', { n: now.part.done + 1, total: now.part.total })
        : t(`scan.now.${isStage(now.step) ? now.step : 'open'}`);
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
          {STAGES.map((s, i) => {
            const state = i < current ? 'done' : i === current ? 'active' : 'waiting';
            return (
              <li
                key={s}
                data-state={state}
                aria-current={state === 'active' ? 'step' : undefined}
                className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[11px] tracking-[0.1em] uppercase ${
                  state === 'active'
                    ? 'border-accent bg-accent/10 text-ink'
                    : state === 'done'
                      ? 'border-line bg-panel text-soft'
                      : 'border-line/60 text-muted'
                }`}
              >
                {state === 'done' ? (
                  <span className="text-safe">
                    <Icon name="check" size={15} strokeWidth={2.2} />
                  </span>
                ) : state === 'active' ? (
                  <span
                    aria-hidden="true"
                    className="inline-block size-3 animate-spin rounded-full border-2 border-accent border-t-transparent"
                  />
                ) : (
                  <span aria-hidden="true" className="size-1.5 bg-edge" />
                )}
                {t(`stage.${s}`)}
              </li>
            );
          })}
        </ul>
      </div>

      {!done && (
        // The scan takes seconds (longer the first time, while models download): say what it is
        // doing and how far it has got, above the photo where it is seen first.
        <div
          data-testid="scan-progress"
          className="mt-6 flex items-center gap-4 border border-accent/50 bg-accent/5 px-4 py-3"
        >
          <span
            aria-hidden="true"
            className="inline-block size-6 shrink-0 animate-spin rounded-full border-[3px] border-accent border-t-transparent"
          />
          <div className="min-w-0 flex-1">
            <p role="status" className="m-0 text-[15px] text-ink">
              {status}
            </p>
            <div
              role="progressbar"
              aria-label={t('scan.progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="mt-2 h-1.5 w-full overflow-hidden bg-line"
            >
              <div
                className="scan-bar h-full bg-accent transition-[width] duration-500"
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </div>
          </div>
          <span className="shrink-0 font-mono text-sm text-accent tabular-nums">{pct}%</span>
        </div>
      )}

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
