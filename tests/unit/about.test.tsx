import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, type Locale } from '../../src/i18n.tsx';
import { About } from '../../src/screens/About.tsx';
import { AppView } from '../../src/App.tsx';
import { initialSession } from '../../src/state/session.ts';
import type { Pipeline } from '../../src/state/usePipeline.ts';

const show = (locale: Locale) =>
  render(
    <I18nProvider initial={locale}>
      <About onBack={() => {}} />
    </I18nProvider>,
  );

afterEach(() => history.replaceState(null, '', '/'));

describe('About', () => {
  it('shows the exact counter request and what is never stored', () => {
    show('en');
    expect(screen.getByTestId('count-request')).toHaveTextContent('POST /api/hit');
    expect(screen.getByText(/Never stored: IP addresses/)).toBeInTheDocument();
    expect(screen.getByText(/day, event, count/)).toBeInTheDocument();
  });

  it('lists every detection model with its license, and the map data attribution', () => {
    show('en');
    const list = screen.getByTestId('model-list');
    expect(list.querySelectorAll('li')).toHaveLength(4);
    expect(list).toHaveTextContent('MIT');
    expect(list).toHaveTextContent('Apache-2.0');
    expect(screen.getByText(/GeoNames, CC BY 4.0/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source code on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/bryneTane/terces',
    );
  });

  it('is translated', () => {
    show('fr');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comment fonctionne Terces');
  });

  it('opens from the landing page through #about', () => {
    const pipeline = {
      session: initialSession,
      scanner: { ready: false, progress: 0, error: null },
    } as unknown as Pipeline;
    render(
      <I18nProvider initial="en">
        <AppView pipeline={pipeline} />
      </I18nProvider>,
    );
    act(() => {
      history.replaceState(null, '', '/#about');
      dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How Terces works');
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Back' })));
  });
});
