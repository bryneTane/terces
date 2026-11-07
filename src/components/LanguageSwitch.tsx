import { LOCALES, useI18n } from '../i18n.tsx';

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div role="group" aria-label={t('lang.label')} className="flex border border-line font-mono text-xs">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => setLocale(l)}
          className={`min-h-8 px-2.5 py-1.5 uppercase ${l === locale ? 'bg-accent text-void' : 'text-dim hover:text-ink'}`}
          title={t(`lang.${l}`)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
