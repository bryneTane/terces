import { useState } from 'react';
import { useI18n } from '../i18n.tsx';
import { promptInstall, useInstallWay, type InstallWay } from '../lib/install.ts';
import { Icon, type IconName } from './Icon.tsx';

/** The browser's own steps, when it has no install dialog to show. */
const STEPS: Record<Exclude<InstallWay, 'prompt' | null>, { title: string; steps: [IconName, string][] }> = {
  ios: {
    title: 'install.iosTitle',
    steps: [
      ['share', 'install.iosShare'],
      ['upload', 'install.iosAdd'],
    ],
  },
  mac: { title: 'install.macTitle', steps: [['file', 'install.mac']] },
  menu: { title: 'install.menuTitle', steps: [['menu', 'install.menu']] },
  none: { title: 'install.noneTitle', steps: [['close', 'install.none']] },
};

/** "Install app": the browser's own dialog, or the steps to take in this browser. */
export function InstallButton({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const way = useInstallWay();
  const [open, setOpen] = useState(false);
  if (!way) return null;
  const how = way === 'prompt' ? null : STEPS[way];
  return (
    <span className={`relative ${className}`}>
      <button
        type="button"
        data-testid="install"
        aria-expanded={how ? open : undefined}
        onClick={() => (how ? setOpen((o) => !o) : void promptInstall())}
        className="btn-ghost border-accent/60 text-accent max-sm:w-full"
      >
        <Icon name="download" size={17} />
        {t('install.button')}
      </button>
      {how && open && (
        <span
          role="dialog"
          aria-label={t(how.title)}
          className="absolute top-full left-0 z-30 mt-2 grid w-full gap-2 border border-edge bg-panel p-4 text-sm text-ink shadow-xl sm:w-80"
        >
          <span className="font-medium">{t(how.title)}</span>
          {how.steps.map(([icon, key]) => (
            <span key={key} className="flex items-start gap-2 text-dim">
              <span className="mt-0.5 text-accent">
                <Icon name={icon} size={16} />
              </span>
              {t(key)}
            </span>
          ))}
          {way !== 'none' && <span className="text-xs text-dim">{t('install.why')}</span>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-1 justify-self-end font-mono text-[11px] tracking-[0.12em] text-accent uppercase"
          >
            {t('install.close')}
          </button>
        </span>
      )}
    </span>
  );
}
