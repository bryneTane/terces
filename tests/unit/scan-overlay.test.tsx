import { render, screen } from '@testing-library/react';
import { expect, expectTypeOf, it, vi } from 'vitest';
import { ScanOverlay, bracketPath } from '../../src/components/ScanOverlay.tsx';
import { QualityProvider } from '../../src/fx/QualityProvider.tsx';
import { ScanRenderer } from '../../src/fx/scanRenderer.ts';
import type { VisualFinding } from '../../src/lib/types.ts';

const f = (id: string, category: VisualFinding['category']): VisualFinding => ({
  id,
  category,
  box: { x: 10, y: 10, w: 40, h: 20 },
  score: 1,
  source: 'yunet',
});

it('draws plain outlines on the static tier, alert colour except for people', () => {
  render(
    <QualityProvider forceTier="static">
      <ScanOverlay findings={[f('a', 'face'), f('b', 'person')]} width={100} height={100} active />
    </QualityProvider>,
  );
  expect(screen.getByTestId('scan-overlay')).toHaveAttribute('data-tier', 'static');
  const r = screen.getAllByTestId('reticle');
  expect(r).toHaveLength(2);
  expect(r[0]).toHaveClass('stroke-alert');
  expect(r[1]).toHaveClass('stroke-accent');
});

it('takes boxes only: its props have no image', () => {
  type Props = Parameters<typeof ScanOverlay>[0];
  expectTypeOf<keyof Props>().toEqualTypeOf<'findings' | 'width' | 'height' | 'active'>();
});

it('bracket path has four corners', () => {
  expect(bracketPath({ x: 0, y: 0, w: 100, h: 50 }).match(/M/g)).toHaveLength(4);
});

it('starts the renderer once the photo size arrives (the canvas does not exist before)', () => {
  const create = vi.spyOn(ScanRenderer, 'create').mockReturnValue(null);
  const ui = (w: number) => (
    <QualityProvider forceTier="medium">
      <ScanOverlay findings={[]} width={w} height={w} active />
    </QualityProvider>
  );
  const { rerender } = render(ui(0));
  expect(create).not.toHaveBeenCalled();
  rerender(ui(100));
  expect(create).toHaveBeenCalledTimes(1);
  create.mockRestore();
});
