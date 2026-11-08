import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AppView } from '../../src/App.tsx';
import { I18nProvider, type Locale } from '../../src/i18n.tsx';
import { initialSession } from '../../src/state/session.ts';
import type { Pipeline } from '../../src/state/usePipeline.ts';
import type { PhotoSession, Zone } from '../../src/lib/types.ts';

URL.createObjectURL = vi.fn(() => 'blob:test');
URL.revokeObjectURL = vi.fn();

const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
const zone = (category: Zone['category'], selected = true): Zone => ({
  id: `z-${category}`,
  kind: 'detected',
  category,
  rect: { x: 10, y: 10, w: 20, h: 20 },
  selected,
});

function pipeline(session: Partial<PhotoSession>, over: Partial<Pipeline> = {}): Pipeline {
  return {
    session: { ...initialSession, id: 's', file, width: 100, height: 80, ...session },
    scanner: { ready: true, progress: 1, error: null },
    offlineReady: false,
    pick: vi.fn(),
    skip: vi.fn(),
    proceed: vi.fn(),
    cloak: vi.fn(),
    reset: vi.fn(),
    setZones: vi.fn(),
    editZones: vi.fn(),
    ...over,
  } as Pipeline;
}

const show = (p: Pipeline, locale: Locale = 'en') =>
  render(
    <I18nProvider initial={locale}>
      <AppView pipeline={p} />
    </I18nProvider>,
  );

describe('Landing', () => {
  it('shows the hook and picks a photo', () => {
    const p = pipeline({ state: 'idle' });
    show(p);
    expect(screen.getByText('Free · On your device · No upload')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    expect(p.pick).toHaveBeenCalledWith(file);
  });

  it('is translated', () => {
    show(pipeline({ state: 'idle' }), 'fr');
    expect(screen.getAllByRole('button', { name: 'Choisir une photo' }).length).toBeGreaterThan(0);
  });
});

describe('Scan', () => {
  it('shows model loading progress, a live report and reticles, and can skip', () => {
    const skip = vi.fn();
    show(
      pipeline(
        {
          state: 'scanning',
          visual: [{ id: 'f', category: 'face', box: { x: 1, y: 1, w: 5, h: 5 }, score: 1, source: 'yunet' }],
        },
        { scanner: { ready: false, progress: 0.42, error: null }, skip },
      ),
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByRole('status')).toHaveTextContent('Getting the scanner ready, once. 42%');
    expect(screen.getByTestId('intel-count')).toHaveTextContent('This photo gives away 1 thing.');
    expect(screen.getAllByTestId('reticle')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to review' }));
    expect(skip).toHaveBeenCalled();
  });

  it('says which step runs and how far the scan has got', () => {
    const p = pipeline(
      { id: 's1', state: 'scanning' },
      { scanner: { ready: true, progress: 1, error: null, step: { id: 's1', stage: 'text-rec', part: { done: 4, total: 10 } } } },
    );
    show(p);
    expect(screen.getByRole('status')).toHaveTextContent('Reading the text, alphabet 5 of 10...');
    // Steps: open, faces, find text, read text (4/10 done), people, plates.
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(Math.round((3.4 / 6) * 100)));
    const chips = screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-state'));
    expect(chips.map((c) => c.dataset.state)).toEqual(['done', 'done', 'active', 'waiting', 'waiting']);
  });

  it('ignores the step of an earlier photo', () => {
    show(
      pipeline(
        { id: 's2', state: 'scanning' },
        { scanner: { ready: true, progress: 1, error: null, step: { id: 's1', stage: 'person' } } },
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Opening the photo and its hidden data...');
  });

  it('keeps the report on screen when done, until the user moves on', () => {
    const proceed = vi.fn();
    show(pipeline({ state: 'scanned' }, { proceed }));
    expect(
      screen.getByRole('heading', { name: 'Here is what anyone who gets this photo can learn.' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip to review' })).toBeNull();
    expect(screen.queryByTestId('scan-progress')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cloak this photo' }));
    expect(proceed).toHaveBeenCalled();
  });
});

describe('Review', () => {
  it('outlines zones, counts metadata and cloaks', () => {
    const p = pipeline({
      state: 'reviewing',
      zones: [zone('face'), zone('text')],
      metadata: [{ group: 'device', label: 'meta.device', value: 'X', raw: {} }],
    });
    show(p);
    expect(screen.getAllByTestId('zone')).toHaveLength(2);
    expect(screen.getByText('The metadata group is removed, always.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cloak · 2 zones' }));
    expect(p.cloak).toHaveBeenCalled();
  });

  it('says so when nothing was detected', () => {
    show(pipeline({ state: 'reviewing', zones: [] }));
    expect(
      screen.getByText(
        'Nothing detected. Draw to cover anything you want hidden. Metadata is still removed.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a loading state while cloaking', () => {
    show(pipeline({ state: 'cloaking', zones: [zone('face')] }));
    expect(screen.getByRole('button', { name: /Working/ })).toBeDisabled();
  });
});

describe('Result', () => {
  const result = (verified: boolean) => ({
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    url: 'blob:r',
    width: 100,
    height: 80,
    verified,
    summary: { metadataRemoved: 3, faces: 2, text: 1, plates: 1, manual: 0 },
  });

  it('summarises, compares before and after and offers sharing', () => {
    const p = pipeline({ state: 'result', result: result(true) });
    show(p);
    expect(screen.getByTestId('summary')).toHaveTextContent('Removed: 3 metadata, 2 faces, 2 readable text.');
    const slider = screen.getByRole('slider', { name: 'Compare before and after' });
    fireEvent.change(slider, { target: { value: '20' } });
    expect(slider).toHaveValue('20');
    expect(screen.getByRole('button', { name: /^(Share|Download)$/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'New photo' }));
    expect(p.reset).toHaveBeenCalled();
  });

  it('blocks sharing when verification failed', () => {
    show(pipeline({ state: 'result', result: result(false) }));
    expect(screen.queryByRole('button', { name: /^(Share|Download)$/ })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('blocked sharing');
  });
});

describe('ErrorScreen', () => {
  it('explains the error and resets', () => {
    const p = pipeline({ state: 'error', error: { code: 'heic' } });
    show(p);
    expect(screen.getByRole('alert')).toHaveTextContent('HEIC');
    fireEvent.click(screen.getByRole('button', { name: 'Try another photo' }));
    expect(p.reset).toHaveBeenCalled();
  });
});
