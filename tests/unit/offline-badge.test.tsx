import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StatusBadge } from '../../src/components/SiteHeader.tsx';
import { I18nProvider } from '../../src/i18n.tsx';

afterEach(() => vi.restoreAllMocks());

it('appears when the device goes offline and disappears when back online', () => {
  const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  render(
    <I18nProvider initial="fr">
      <StatusBadge ready={false} />
    </I18nProvider>,
  );
  expect(screen.queryByTestId('offline-badge')).toBeNull();
  onLine.mockReturnValue(false);
  act(() => void dispatchEvent(new Event('offline')));
  expect(screen.getByTestId('offline-badge')).toHaveTextContent('Mode avion : tout fonctionne');
  onLine.mockReturnValue(true);
  act(() => void dispatchEvent(new Event('online')));
  expect(screen.queryByTestId('offline-badge')).toBeNull();
});
