import { App } from './AppContainer.tsx';
import { QualityProvider } from './fx/QualityProvider.tsx';
import { I18nProvider, type Locale } from './i18n.tsx';
import { SessionProvider } from './state/SessionProvider.tsx';

/** `locale` pins the language (pre-rendered pages and their hydration); otherwise it is detected. */
export function Root({ locale }: { locale?: Locale }) {
  return (
    <I18nProvider initial={locale}>
      <QualityProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </QualityProvider>
    </I18nProvider>
  );
}
