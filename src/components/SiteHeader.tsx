import { useState, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n.tsx';
import { Icon, Logo, Wordmark } from './Icon.tsx';
import { LanguageSwitch } from './LanguageSwitch.tsx';

const SOURCE_URL = 'https://github.com/bryneTane/terces';

function subscribe(cb: () => void) {
  addEventListener('online', cb);
  addEventListener('offline', cb);
  return () => {
    removeEventListener('online', cb);
    removeEventListener('offline', cb);
  };
}

/** Network status: the airplane-mode proof when offline, "ready offline" once everything is cached. */
export function StatusBadge({ ready }: { ready: boolean }) {
  const { t } = useI18n();
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (!online)
    return (
      <span
        role="status"
        data-testid="offline-badge"
        className="border border-accent px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-accent"
      >
        {t('offline.badge')}
      </span>
    );
  if (!ready) return null;
  return (
    <span
      data-testid="ready-badge"
      className="flex items-center gap-2 border border-line px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-dim"
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-safe" />
      <span className="max-sm:sr-only">{t('status.ready')}</span>
    </span>
  );
}

function Brand({ onHome }: { onHome?: () => void }) {
  const { t } = useI18n();
  const inner = (
    <>
      <Logo size={30} />
      <Wordmark height={15} className={`text-ink ${onHome ? 'max-sm:hidden' : ''}`} />
      <span className="sr-only">{t('app.name')}</span>
    </>
  );
  return onHome ? (
    <button type="button" onClick={onHome} aria-label={t('nav.home')} className="flex items-center gap-3">
      {inner}
    </button>
  ) : (
    <a href="#top" className="flex items-center gap-3 no-underline">
      {inner}
    </a>
  );
}

const NAV = [
  ['#how', 'nav.how'],
  ['#gives', 'nav.gives'],
  ['#privacy', 'nav.privacy'],
  ['#about', 'nav.about'],
] as const;

/** Landing header: brand, section links (a menu on phones), status, language, source. */
export function SiteHeader({ ready }: { ready: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-void/85 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-[1200px] flex-wrap items-center gap-x-8 gap-y-3 px-4 sm:px-8">
        <Brand />
        <nav aria-label={t('nav.label')} className="hidden flex-1 flex-wrap gap-x-7 gap-y-1 text-sm lg:flex">
          {NAV.map(([href, key]) => (
            <a key={href} href={href} className="text-dim no-underline hover:text-ink">
              {t(key)}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <StatusBadge ready={ready} />
          <LanguageSwitch />
          <a
            href={SOURCE_URL}
            aria-label={t('nav.source')}
            className="hidden text-dim hover:text-ink sm:flex"
          >
            <Icon name="code" size={22} />
          </a>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={t('nav.menu')}
            onClick={() => setOpen((o) => !o)}
            className="grid size-10 place-items-center border border-line text-dim lg:hidden"
          >
            <Icon name={open ? 'close' : 'menu'} size={18} />
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-nav"
          aria-label={t('nav.label')}
          className="grid border-t border-line px-4 py-2 lg:hidden"
        >
          {NAV.map(([href, key]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="py-3 text-dim no-underline hover:text-ink"
            >
              {t(key)}
            </a>
          ))}
          <a href={SOURCE_URL} className="py-3 text-dim no-underline hover:text-ink">
            {t('nav.source')}
          </a>
        </nav>
      )}
    </header>
  );
}

const STEPS = ['steps.scan', 'steps.cloak', 'steps.share'] as const;

/** Header during the flow: brand (back to start), the 1-2-3 tracker, status and language. */
export function FlowHeader({ step, ready, onHome }: { step: 1 | 2 | 3; ready: boolean; onHome: () => void }) {
  const { t } = useI18n();
  return (
    <header className="border-b border-line/70 bg-void/90">
      <div className="mx-auto flex min-h-16 max-w-[1320px] items-center gap-3 px-4 sm:gap-8 sm:px-8">
        <Brand onHome={onHome} />
        <ol
          aria-label={t('steps.label')}
          className="mx-auto flex items-center gap-3 font-mono text-xs tracking-[0.14em]"
        >
          {STEPS.map((key, i) => {
            const n = i + 1;
            const current = n === step;
            const done = n < step;
            return (
              <li
                key={key}
                aria-current={current ? 'step' : undefined}
                className={`flex items-center gap-3 ${current ? 'text-accent' : 'text-muted'} ${current ? '' : 'max-md:hidden'}`}
              >
                {i > 0 && <span aria-hidden="true" className="h-px w-10 bg-edge max-md:hidden" />}
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`grid size-[22px] place-items-center ${current ? 'bg-accent text-void' : done ? 'border border-accent text-accent' : 'border border-edge'}`}
                  >
                    {done ? <Icon name="check" size={13} strokeWidth={2.4} /> : n}
                  </span>
                  <span className="uppercase">{t(key)}</span>
                  {current && <span className="sr-only">{t('steps.short', { n })}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-2 sm:gap-4">
          <StatusBadge ready={ready} />
          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
}
