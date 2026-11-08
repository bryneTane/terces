import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n.tsx';
import type { PhotoSession } from '../../src/lib/types.ts';
import { Review } from '../../src/screens/Review.tsx';
import { initialSession } from '../../src/state/session.ts';

const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
const session = (over: Partial<PhotoSession> = {}): PhotoSession => ({
  ...initialSession,
  id: 's',
  state: 'reviewing',
  file,
  width: 100,
  height: 100,
  ...over,
});
const show = (s: PhotoSession, onCloak = vi.fn()) =>
  render(
    <I18nProvider initial="en">
      <Review session={s} onCloak={onCloak} onZones={vi.fn()} />
    </I18nProvider>,
  );

describe('Review', () => {
  it('explains the empty scan and still offers to cloak', () => {
    show(session());
    expect(screen.getByTestId('review-hint')).toHaveTextContent(
      'Nothing detected. Draw to cover anything you want hidden.',
    );
    expect(screen.getByRole('button', { name: 'Cloak · 0 zones' })).toBeEnabled();
  });

  it('cloaks with the chosen mask style', () => {
    const onCloak = vi.fn();
    show(
      session({
        zones: [
          { id: 'z', kind: 'detected', category: 'face', rect: { x: 0, y: 0, w: 10, h: 10 }, selected: true },
        ],
      }),
      onCloak,
    );
    expect(screen.getByTestId('review-hint')).toHaveTextContent('Tap a zone');
    const faces = within(screen.getByRole('group', { name: 'Faces' }));
    expect(faces.getByLabelText('Blur')).toBeChecked();
    expect(faces.getByLabelText('Emoji')).toBeInTheDocument();
    expect(screen.queryByLabelText('👶')).toBeNull(); // emoji picker only once Emoji is chosen
    fireEvent.click(faces.getByLabelText('Emoji'));
    expect(screen.getByLabelText('Mix')).toBeChecked();
    fireEvent.click(screen.getByLabelText('👶'));
    fireEvent.click(screen.getByRole('button', { name: 'Cloak · 1 zone' }));
    expect(onCloak).toHaveBeenCalledWith({ face: 'emoji', emoji: '👶' });
  });
});

describe('Review editing', () => {
  it('toggles from the list and undoes it', () => {
    const z = {
      id: 'z',
      kind: 'detected' as const,
      category: 'face' as const,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      selected: true,
    };
    const onZones = vi.fn();
    const { rerender } = render(
      <I18nProvider initial="en">
        <Review session={session({ zones: [z] })} onCloak={vi.fn()} onZones={onZones} />
      </I18nProvider>,
    );
    const row = screen
      .getAllByRole('button', { name: /Face 1/ })
      .find((b) => b.textContent?.includes('Face 1'))!;
    fireEvent.click(row);
    const off = onZones.mock.calls[0]![0];
    expect(off[0].selected).toBe(false);
    rerender(
      <I18nProvider initial="en">
        <Review session={session({ zones: off })} onCloak={vi.fn()} onZones={onZones} />
      </I18nProvider>,
    );
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(onZones).toHaveBeenLastCalledWith([z]);
  });
});

describe('Review in manual mode', () => {
  it('explains that the scanner failed and keeps drawing available', () => {
    show(session({ notice: { code: 'oom' } }));
    expect(screen.getByTestId('manual-mode')).toHaveTextContent('ran out of memory');
    expect(screen.getByTestId('zone-layer')).toBeInTheDocument();
  });
});

describe('Review zone list', () => {
  it('groups are accordions: short ones open, long ones collapsed', () => {
    const text = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i}`,
      kind: 'detected' as const,
      category: 'text' as const,
      rect: { x: i * 10, y: 0, w: 8, h: 8 },
      selected: true,
    }));
    const face = { ...text[0]!, id: 'f', category: 'face' as const };
    show(session({ zones: [face, ...text] }));
    const faces = screen.getByRole('button', { name: 'Faces' });
    const texts = screen.getByRole('button', { name: 'Text' });
    expect(faces).toHaveAttribute('aria-expanded', 'true');
    expect(texts).toHaveAttribute('aria-expanded', 'false');
    const list = document.getElementById(texts.getAttribute('aria-controls')!)!;
    expect(list).not.toBeVisible();
    fireEvent.click(texts);
    expect(texts).toHaveAttribute('aria-expanded', 'true');
    expect(list).toBeVisible();
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);
  });
});

describe('Review zone names', () => {
  it('names text zones by what they say, and numbers the unread ones', () => {
    const t = (id: string, text?: string) => ({
      id,
      kind: 'detected' as const,
      category: 'text' as const,
      rect: { x: 0, y: 0, w: 8, h: 8 },
      selected: true,
      ...(text ? { text } : {}),
    });
    show(session({ zones: [t('a', 'THE TOURIST'), t('b'), t('c', 'Nina')] }));
    const list = document.getElementById('zones-text')!;
    expect(within(list).getByText('“THE TOURIST”')).toBeInTheDocument();
    expect(within(list).getByText('“Nina”')).toBeInTheDocument();
    expect(within(list).getByText('Text 1')).toBeInTheDocument();
  });
});
