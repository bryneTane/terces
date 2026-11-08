import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IntelFile, MAX_QUOTES } from '../../src/components/IntelFile.tsx';
import { QualityProvider } from '../../src/fx/QualityProvider.tsx';
import { I18nProvider, type Locale } from '../../src/i18n.tsx';
import type { MetadataFinding, VisualFinding } from '../../src/lib/types.ts';

const meta: MetadataFinding[] = [
  {
    group: 'location',
    label: 'meta.location',
    value: '45.7640, 4.8357',
    raw: {},
    geo: { lat: 45.764, lon: 4.8357, place: 'Lyon, FR' },
  },
  { group: 'device', label: 'meta.device', value: 'Apple iPhone 17 Pro', raw: {} },
];
let n = 0;
const v = (category: VisualFinding['category'], text?: string): VisualFinding => ({
  id: `v${n++}`,
  category,
  box: { x: 0, y: 0, w: 10, h: 10 },
  score: 1,
  source: 'ppocr',
  ...(text ? { text } : {}),
});

function show(metadata: MetadataFinding[], visual: VisualFinding[], locale: Locale = 'en', done = true) {
  return render(
    <I18nProvider initial={locale}>
      <QualityProvider forceTier="static">
        <IntelFile metadata={metadata} visual={visual} done={done} />
      </QualityProvider>
    </I18nProvider>,
  );
}

const rowSum = () => screen.getAllByTestId('intel-row').reduce((a, r) => a + Number(r.dataset.count), 0);

describe('IntelFile', () => {
  it('lists the metadata, the place and the read text, and the count matches the rows', () => {
    show(meta, [
      v('face'),
      v('face'),
      v('face'),
      v('text', '12 RUE DE LA PAIX'),
      v('plate', 'AB-123-CD'),
      v('text'),
      v('person'),
    ]);
    expect(screen.getByTestId('intel-count')).toHaveTextContent('This photo gives away 9 things.');
    expect(rowSum()).toBe(9);
    expect(screen.getByText('45.7640, 4.8357 (near Lyon, FR)')).toBeInTheDocument();
    expect(screen.getByText('Apple iPhone 17 Pro')).toBeInTheDocument();
    expect(screen.getByText('12 RUE DE LA PAIX')).toBeInTheDocument();
    expect(screen.getByText('AB-123-CD')).toBeInTheDocument();
    expect(screen.getByText('3 faces')).toBeInTheDocument();
    expect(screen.getByText('1 text area we could not read')).toBeInTheDocument();
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });

  it('truncates dense text with "+k more" and still adds up', () => {
    const many = Array.from({ length: MAX_QUOTES + 5 }, (_, i) => v('text', `line ${i}`));
    show([], many);
    expect(screen.getByText('+5 more')).toBeInTheDocument();
    expect(rowSum()).toBe(MAX_QUOTES + 5);
    expect(screen.getByTestId('intel-count')).toHaveTextContent(String(MAX_QUOTES + 5));
  });

  it('explains missing metadata, with the iPhone picker tip', () => {
    show([], [v('face')]);
    const none = screen.getByTestId('metadata-none');
    expect(within(none).getByText(/probably removed it already/)).toBeInTheDocument();
    expect(within(none).getByText(/Options/)).toBeInTheDocument();
    expect(screen.queryByTestId('minimap')).toBeNull();
  });

  it('says it is still looking, then that nothing was found', () => {
    const { unmount } = show([], [], 'en', false);
    expect(screen.getByText(/Looking for what this photo gives away/)).toBeInTheDocument();
    unmount();
    show([], [], 'en', true);
    expect(screen.getByText(/We found nothing/)).toBeInTheDocument();
  });

  it('is translated', () => {
    show(meta, [v('face')], 'fr');
    expect(screen.getByTestId('intel-count')).toHaveTextContent('Cette photo révèle 3 informations.');
    expect(screen.getByText('45.7640, 4.8357 (près de Lyon, FR)')).toBeInTheDocument();
  });
});
