import { InstallButton } from '../components/InstallButton.tsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HeroPhoto } from '../components/HeroPhoto.tsx';
import { Icon, Logo, Wordmark, type IconName } from '../components/Icon.tsx';
import { useI18n } from '../i18n.tsx';

const SOURCE_URL = 'https://github.com/bryneTane/terces';

/** First image file in a drop or a paste, if any. */
export function imageFrom(list: DataTransfer | null): File | null {
  if (!list) return null;
  for (const f of Array.from(list.files ?? []))
    if (f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)) return f;
  return null;
}

/** Drop a photo anywhere on the page, or paste one. */
function useDropAndPaste(onPick: (file: File) => void) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    };
    const overHandler = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const f = imageFrom(e.dataTransfer);
      if (f) onPick(f);
    };
    const paste = (e: ClipboardEvent) => {
      const f = imageFrom(e.clipboardData);
      if (f) {
        e.preventDefault();
        onPick(f);
      }
    };
    addEventListener('dragenter', enter);
    addEventListener('dragover', overHandler);
    addEventListener('dragleave', leave);
    addEventListener('drop', drop);
    addEventListener('paste', paste);
    return () => {
      removeEventListener('dragenter', enter);
      removeEventListener('dragover', overHandler);
      removeEventListener('dragleave', leave);
      removeEventListener('drop', drop);
      removeEventListener('paste', paste);
    };
  }, [onPick]);
  return over;
}

function Section({
  id,
  kicker,
  title,
  children,
  aside,
}: {
  id: string;
  kicker: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pt-20 pb-10 sm:px-8 sm:pt-28"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div>
          <p className="kicker m-0">{kicker}</p>
          <h2
            id={`${id}-title`}
            className="font-display mt-3.5 mb-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] sm:text-[44px]"
          >
            {title}
          </h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Step({
  n,
  meta,
  title,
  body,
  art,
}: {
  n: string;
  meta: string;
  title: string;
  body: string;
  art: ReactNode;
}) {
  return (
    <li className="border border-line bg-panel p-6 transition-colors hover:border-edge hover:bg-[#0c1b29] sm:p-7">
      <div className="flex items-center justify-between font-mono">
        <span className="text-[13px] text-accent">{n}</span>
        <span className="text-[11px] uppercase tracking-[0.16em] text-muted">{meta}</span>
      </div>
      <svg viewBox="0 0 240 150" width="100%" height="150" aria-hidden="true" className="my-6 block">
        {art}
      </svg>
      <h3 className="font-display m-0 text-[22px] font-semibold">{title}</h3>
      <p className="mt-2 mb-0 text-[15px] text-dim">{body}</p>
    </li>
  );
}

const frame = <rect x="20" y="8" width="200" height="134" fill="#071019" stroke="#1d3a52" />;
const person = (
  <>
    <circle cx="120" cy="62" r="20" fill="#1d3a52" />
    <path d="M76 142c4-32 22-46 44-46s40 14 44 46z" fill="#1d3a52" />
  </>
);

const LEAKS: [IconName, string, boolean][] = [
  ['pin', 'location', false],
  ['clock', 'datetime', false],
  ['phone', 'device', false],
  ['camera', 'lens', false],
  ['id', 'serial', false],
  ['face', 'faces', false],
  ['text', 'text', false],
  ['plate', 'plates', false],
  ['person', 'people', true],
];

export function Landing({ onPick }: { onPick: (file: File) => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const over = useDropAndPaste(onPick);
  const choose = () => input.current?.click();

  const cta = (
    <button type="button" onClick={choose} className="btn-primary">
      {t('landing.cta')}
      <Icon name="arrow" />
    </button>
  );

  return (
    <div className="flex-1">
      <section id="top" className="grid-bg relative">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_72%_42%,rgb(141_232_255/0.13),transparent_70%),linear-gradient(180deg,rgb(4_7_12/0.2),var(--color-void)_96%)]"
        />
        <div className="relative mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-20 gap-y-14 px-4 pt-10 pb-20 sm:px-8 sm:pt-24 sm:pb-32">
          <div className="min-w-0 flex-[1_1_420px]">
            <p className="kicker m-0 mb-6 flex items-center gap-3">
              <span aria-hidden="true" className="anim-pulse size-2 bg-alert" />
              {t('landing.kicker')}
            </p>
            <h1
              tabIndex={-1}
              className="font-display m-0 text-[42px] leading-[1.02] font-semibold tracking-[-0.035em] sm:text-[68px]"
            >
              {t('landing.titleA')} <span className="text-accent">{t('landing.titleB')}</span>
            </h1>
            <p className="mt-6 mb-0 max-w-[470px] text-[17px] leading-relaxed text-dim sm:text-[19px]">
              {t('landing.subtitle')}
            </p>

            <div
              className={`brackets relative mt-10 flex flex-wrap items-center gap-x-6 gap-y-5 border border-dashed p-5 transition-colors sm:px-7 sm:py-6 ${over ? 'border-accent bg-accent/10' : 'border-edge bg-panel/80'}`}
            >
              <span
                aria-hidden="true"
                className="hidden size-14 place-items-center border border-edge bg-accent/5 text-accent sm:grid"
              >
                <Icon name="upload" size={26} />
              </span>
              <div className="hidden min-w-0 flex-[1_1_180px] sm:block">
                <p className="m-0 text-[17px] font-semibold">
                  {over ? t('landing.dropActive') : t('landing.drop')}
                </p>
                <p className="mt-0.5 mb-0 text-sm text-dim">{t('landing.dropAlt')}</p>
              </div>
              <span className="max-sm:w-full max-sm:[&>button]:w-full">{cta}</span>
            </div>
            {/* In the first screen, under the main action: the header has no room for it on phones. */}
            <InstallButton className="mt-4 block" />

            <ul className="mt-7 mb-0 flex list-none flex-wrap gap-x-7 gap-y-3 p-0 font-mono text-xs tracking-[0.08em] text-dim">
              {(
                [
                  ['noCloud', 'landing.badgeUpload'],
                  ['noWifi', 'landing.badgeOffline'],
                  ['code', 'landing.badgeOpen'],
                ] as const
              ).map(([icon, key]) => (
                <li key={key} className="flex items-center gap-2 uppercase">
                  <span className="text-accent">
                    <Icon name={icon} size={17} />
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 flex-[1_1_520px]">
            <HeroPhoto />
          </div>
        </div>
      </section>

      <Section id="how" kicker={t('how.kicker')} title={t('how.title')}>
        <ol className="mt-12 grid list-none grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6 p-0">
          <Step
            n="01"
            meta={t('how.scanMeta')}
            title={t('steps.scan')}
            body={t('how.scanBody')}
            art={
              <>
                <defs>
                  <linearGradient id="hw-beam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#8de8ff" stopOpacity="0" />
                    <stop offset="1" stopColor="#8de8ff" stopOpacity="0.28" />
                  </linearGradient>
                </defs>
                {frame}
                {person}
                <path
                  d="M93 46v-9h9M138 37h9v9M147 79v9h-9M102 88h-9v-9"
                  fill="none"
                  stroke="#ff7320"
                  strokeWidth="2.5"
                />
                <rect x="20" y="70" width="200" height="40" fill="url(#hw-beam)" />
                <line x1="20" y1="110" x2="220" y2="110" stroke="#8de8ff" strokeWidth="2" />
                <rect x="150" y="18" width="58" height="16" fill="#ff7320" />
                <text
                  x="179"
                  y="29.5"
                  textAnchor="middle"
                  fill="#04070c"
                  style={{ font: "500 9px 'JetBrains Mono', monospace", letterSpacing: 1 }}
                >
                  {t('cat.face').toUpperCase()}
                </text>
              </>
            }
          />
          <Step
            n="02"
            meta={t('how.cloakMeta')}
            title={t('steps.cloak')}
            body={t('how.cloakBody')}
            art={
              <>
                {frame}
                {person}
                <rect
                  x="94"
                  y="38"
                  width="52"
                  height="50"
                  fill="#0b0d10"
                  stroke="#8de8ff"
                  strokeWidth="1.5"
                />
                <rect x="30" y="18" width="62" height="7" fill="#1d3a52" />
                <rect x="30" y="31" width="48" height="7" fill="#1d3a52" />
                <rect x="30" y="44" width="56" height="7" fill="#1d3a52" />
                <line x1="26" y1="21.5" x2="98" y2="21.5" stroke="#ff7320" strokeWidth="2" />
                <line x1="26" y1="34.5" x2="84" y2="34.5" stroke="#ff7320" strokeWidth="2" />
                <line x1="26" y1="47.5" x2="92" y2="47.5" stroke="#ff7320" strokeWidth="2" />
              </>
            }
          />
          <Step
            n="03"
            meta={t('how.shareMeta')}
            title={t('steps.share')}
            body={t('how.shareBody')}
            art={
              <>
                {frame}
                <rect x="44" y="24" width="96" height="102" fill="#0f2233" stroke="#1d3a52" />
                <rect x="76" y="42" width="32" height="30" fill="#0b0d10" />
                <path d="M58 126c3-22 16-32 34-32s31 10 34 32z" fill="#1d3a52" />
                <path
                  d="M172 40l26 10v20c0 16-11 28-26 33-15-5-26-17-26-33V50z"
                  fill="#0f2233"
                  stroke="#8de8ff"
                  strokeWidth="2"
                />
                <path
                  d="M161 72l8 8 15-16"
                  fill="none"
                  stroke="#8de8ff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            }
          />
        </ol>
      </Section>

      <Section
        id="gives"
        kicker={t('gives.kicker')}
        title={t('gives.title')}
        aside={<p className="m-0 max-w-[380px] text-[15px] text-dim">{t('gives.lead')}</p>}
      >
        <ul className="mt-11 grid list-none grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3 border border-line bg-line p-0">
          {LEAKS.map(([icon, key, opt]) => (
            <li key={key} className="flex items-start gap-4 bg-void p-6 transition-colors hover:bg-[#0c1b29]">
              <span
                className={`grid size-[42px] shrink-0 place-items-center border border-edge ${opt ? 'text-accent' : 'text-alert'}`}
              >
                <Icon name={icon} size={21} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{t(`gives.${key}`)}</span>
                <span className="mt-1 block font-mono text-xs text-dim [overflow-wrap:anywhere]">
                  {t(`gives.${key}Value`)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <section
        id="privacy"
        aria-labelledby="privacy-title"
        className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-8 sm:py-28"
      >
        <div className="flex flex-wrap items-center gap-14">
          <div
            aria-hidden="true"
            className="flex min-w-0 flex-[1_1_480px] items-center gap-4 border border-line bg-panel px-5 py-8 sm:px-8 sm:py-10"
          >
            <div className="w-[130px] shrink-0 border border-accent bg-accent/5 px-3 py-4 text-center sm:w-[150px]">
              <span className="text-accent">
                <Icon name="phone" size={40} className="mx-auto" />
              </span>
              <p className="mt-2 mb-3 text-[15px] font-semibold">{t('privacy.phone')}</p>
              <div className="grid gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]">
                {(['privacy.photo', 'privacy.models', 'privacy.cloak'] as const).map((k) => (
                  <span key={k} className="border border-edge p-1.5">
                    {t(k)}
                  </span>
                ))}
              </div>
            </div>
            <div className="anim-dash relative h-0.5 flex-auto bg-[repeating-linear-gradient(90deg,var(--color-edge)_0_8px,transparent_8px_16px)]">
              <span className="absolute top-1/2 left-1/2 -mt-5 -ml-5 grid size-10 place-items-center rounded-full border-2 border-alert bg-void text-alert">
                <Icon name="close" strokeWidth={2.2} />
              </span>
            </div>
            <div className="w-[110px] shrink-0 border border-dashed border-edge px-2.5 py-4 text-center text-muted sm:w-[120px]">
              <Icon name="cloud" size={40} className="mx-auto" />
              <p className="mt-2 mb-0 text-sm">{t('privacy.server')}</p>
              <p className="mt-1.5 mb-0 font-mono text-[11px] uppercase text-alert">{t('privacy.zero')}</p>
            </div>
          </div>
          <div className="min-w-0 flex-[1_1_400px]">
            <p className="kicker m-0">{t('privacy.kicker')}</p>
            <h2
              id="privacy-title"
              className="font-display mt-3.5 mb-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] sm:text-[44px]"
            >
              {t('privacy.title')}
            </h2>
            <ul className="mt-7 mb-0 grid list-none gap-4 p-0 text-[15px] text-soft">
              {(
                [
                  ['chip', 'privacy.memory'],
                  ['noWifi', 'privacy.offline'],
                  ['shield', 'privacy.csp'],
                  ['code', 'privacy.open'],
                ] as const
              ).map(([icon, key]) => (
                <li key={key} className="flex gap-3.5">
                  <span className="text-accent">
                    <Icon name={icon} size={22} />
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>
            <a
              href={SOURCE_URL}
              className="mt-7 inline-flex items-center gap-2 font-mono text-[13px] uppercase tracking-[0.1em]"
            >
              {t('privacy.source')}
              <Icon name="arrow" size={16} />
            </a>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-[linear-gradient(90deg,rgb(141_232_255/0.06),transparent_60%)]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-4 py-14 sm:px-8">
          <h2 className="font-display m-0 text-[26px] font-semibold tracking-[-0.02em] sm:text-[34px]">
            {t('cta.title')}
          </h2>
          {cta}
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1200px] flex-wrap gap-x-16 gap-y-8 px-4 pt-12 pb-14 text-sm text-dim sm:px-8">
        <div className="flex-[1_1_300px]">
          <div className="flex items-center gap-3 text-ink">
            <Logo size={26} />
            <Wordmark height={13} />
            <span className="sr-only">{t('app.name')}</span>
          </div>
          <p className="mt-3.5 mb-0 max-w-[340px]">{t('footer.tagline')}</p>
        </div>
        <nav aria-label="Footer" className="grid gap-2.5">
          <a href="#how" className="text-dim no-underline hover:text-ink">
            {t('nav.how')}
          </a>
          <a href="#privacy" className="text-dim no-underline hover:text-ink">
            {t('nav.privacy')}
          </a>
          <a href="#about" className="text-dim no-underline hover:text-ink">
            {t('nav.about')}
          </a>
          <a href={SOURCE_URL} className="text-dim no-underline hover:text-ink">
            {t('nav.source')}
          </a>
        </nav>
        <div className="flex-[1_1_260px] font-mono text-[11px] leading-[1.8] tracking-[0.04em] text-muted uppercase">
          {t('footer.models')}
          <br />
          {t('footer.maps')}
          <br />
          {t('footer.image')}
        </div>
      </footer>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        data-testid="file-input"
        aria-label={t('landing.cta')}
        tabIndex={-1}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}
