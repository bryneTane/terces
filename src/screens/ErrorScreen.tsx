import { Icon } from '../components/Icon.tsx';
import { useI18n } from '../i18n.tsx';
import type { AppError } from '../lib/types.ts';

export function ErrorScreen({ error, onRetry }: { error: AppError | null; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="grid flex-1 place-items-center px-4 py-16">
      <section
        role="alert"
        className="relative grid w-full max-w-[520px] gap-4 border border-alert/60 bg-panel p-6 sm:p-8"
      >
        <span
          aria-hidden="true"
          className="absolute -top-px -right-px size-3.5 border-t-2 border-r-2 border-alert"
        />
        <span className="grid size-12 place-items-center border border-alert text-alert">
          <Icon name="close" size={22} />
        </span>
        <h1 tabIndex={-1} className="font-display m-0 text-2xl font-semibold">
          {t('error.title')}
        </h1>
        <p className="m-0 text-soft">{t(`error.${error?.code ?? 'unknown'}`)}</p>
        <button type="button" onClick={onRetry} className="btn-primary mt-2 justify-self-start">
          <Icon name="restart" size={17} />
          {t('error.retry')}
        </button>
      </section>
    </div>
  );
}
