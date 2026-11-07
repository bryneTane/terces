import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import en from './messages/en.json';
import fr from './messages/fr.json';

export type Locale = 'en' | 'fr';
export type MessageKey = keyof typeof en;
type Messages = Record<string, string>;
type Vars = Record<string, string | number>;

export const MESSAGES: Record<Locale, Messages> = { en, fr };
export const LOCALES: Locale[] = ['en', 'fr'];
const STORAGE_KEY = 'terces.locale';

/** Pick the initial locale: stored choice, then device language (fr* gives French), else English. */
export function detectLocale(language: string | undefined, stored: string | null): Locale {
  if (stored === 'en' || stored === 'fr') return stored;
  return language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function readStoredLocale(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage can be blocked (private mode). The choice then lasts for the session only.
  }
}

/** Translate with `{var}` interpolation. With a numeric `count`, `key_one` / `key_other` are used when present. */
export function translate(locale: Locale, key: string, vars?: Vars): string {
  const messages = MESSAGES[locale];
  let resolved = key;
  if (vars && typeof vars.count === 'number') {
    const form = new Intl.PluralRules(locale).select(vars.count);
    const candidate = `${key}_${form}`;
    if (candidate in messages) resolved = candidate;
    else if (`${key}_other` in messages) resolved = `${key}_other`;
  }
  const template = messages[resolved] ?? MESSAGES.en[resolved] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars && name in vars ? String(vars[name]) : `{${name}}`,
  );
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initial ?? detectLocale(globalThis.navigator?.language, readStoredLocale()),
  );
  const setLocale = useCallback((l: Locale) => {
    storeLocale(l);
    setLocaleState(l);
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
