import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import en from '../../src/messages/en.json';
import fr from '../../src/messages/fr.json';
import {
  I18nProvider,
  MESSAGES,
  detectLocale,
  readStoredLocale,
  storeLocale,
  translate,
} from '../../src/i18n.tsx';
import { LanguageSwitch } from '../../src/components/LanguageSwitch.tsx';

describe('i18n', () => {
  it('has identical keys in EN and FR', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty messages', () => {
    for (const v of [...Object.values(en), ...Object.values(fr)]) expect(v.trim()).not.toBe('');
  });

  it('detects the locale from storage, then device language', () => {
    expect(detectLocale('fr-FR', null)).toBe('fr');
    expect(detectLocale('en-US', null)).toBe('en');
    expect(detectLocale('de-DE', null)).toBe('en');
    expect(detectLocale('en-US', 'fr')).toBe('fr');
    expect(detectLocale(undefined, 'garbage')).toBe('en');
  });

  it('interpolates and pluralizes', () => {
    const msgs = { 'x.count_one': '{count} thing', 'x.count_other': '{count} things', 'x.hi': 'Hi {name}' };
    Object.assign(MESSAGES.en, msgs);
    expect(translate('en', 'x.count', { count: 1 })).toBe('1 thing');
    expect(translate('en', 'x.count', { count: 7 })).toBe('7 things');
    expect(translate('en', 'x.hi', { name: 'Ana' })).toBe('Hi Ana');
    expect(translate('en', 'missing.key')).toBe('missing.key');
    for (const k of Object.keys(msgs)) delete (MESSAGES.en as Record<string, string>)[k];
  });

  it('survives storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredLocale()).toBeNull();
    expect(() => storeLocale('fr')).not.toThrow();
    spy.mockRestore();
    spy2.mockRestore();
  });

  it('switches language from the switch', () => {
    render(
      <I18nProvider initial="en">
        <LanguageSwitch />
      </I18nProvider>,
    );
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'fr' }));
    expect(screen.getByRole('group', { name: 'Langue' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
  });
});
