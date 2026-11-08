import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallButton } from '../../src/components/InstallButton.tsx';
import { I18nProvider } from '../../src/i18n.tsx';
import { manualWay } from '../../src/lib/install.ts';

const show = () =>
  render(
    <I18nProvider initial="en">
      <InstallButton />
    </I18nProvider>,
  );

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('install', () => {
  afterEach(() => vi.restoreAllMocks());

  it('knows how each browser installs by hand', () => {
    const MAC_SAFARI =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    expect(manualWay(IPHONE_SAFARI, 5)).toBe('ios');
    expect(manualWay(IPHONE_SAFARI.replace('Version/18.0', 'CriOS/130.0'), 5)).toBe('ios');
    expect(manualWay(MAC_SAFARI, 5)).toBe('ios'); // an iPad
    expect(manualWay(MAC_SAFARI, 0)).toBe('mac');
    const MAC_CHROME =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    expect(manualWay(MAC_CHROME, 0)).toBe('menu');
    expect(manualWay('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0', 0)).toBe('none');
    expect(manualWay('Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0', 5)).toBe('menu');
  });

  it('explains the browser menu where there is no install dialog', () => {
    show();
    fireEvent.click(screen.getByTestId('install'));
    expect(screen.getByRole('dialog', { name: 'Install Terces' })).toHaveTextContent(
      "Open your browser's menu, then choose Install app or Add to Home screen.",
    );
  });

  it('shows nothing once installed', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    show();
    expect(screen.queryByTestId('install')).toBeNull();
  });

  it("offers the browser's own install dialog when it sends one", async () => {
    show();
    const prompt = vi.fn(async () => {});
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => void dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    await act(async () => fireEvent.click(screen.getByTestId('install')));
    expect(prompt).toHaveBeenCalledOnce();
    // The dialog is used once: afterwards the button explains the browser menu.
    expect(screen.getByTestId('install')).not.toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByTestId('install'));
    expect(screen.getByRole('dialog', { name: 'Install Terces' })).toBeInTheDocument();
  });

  it('explains the two Safari steps on an iPhone', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5);
    show();
    fireEvent.click(screen.getByTestId('install'));
    const dialog = screen.getByRole('dialog', { name: 'Add Terces to your home screen' });
    expect(dialog).toHaveTextContent('Tap the Share button.');
    expect(dialog).toHaveTextContent('Then tap Add to Home Screen.');
  });
});
