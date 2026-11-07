import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { FieldBackground } from '../../src/components/FieldBackground.tsx';
import { QualityProvider } from '../../src/fx/QualityProvider.tsx';

it('falls back to a static grid without WebGL2 or with reduced motion', () => {
  render(
    <QualityProvider forceTier="static">
      <FieldBackground />
    </QualityProvider>,
  );
  const field = screen.getByTestId('field');
  expect(field).toHaveAttribute('data-tier', 'static');
  expect(field).toHaveAttribute('aria-hidden', 'true');
  expect(field.querySelector('canvas')).toBeNull();
  expect(field.querySelector('.ice-grid')).not.toBeNull();
});

it('mounts a canvas on animated tiers and tolerates a missing WebGL2 context', () => {
  const { unmount } = render(
    <QualityProvider forceTier="high">
      <FieldBackground />
    </QualityProvider>,
  );
  expect(screen.getByTestId('field').querySelector('canvas')).not.toBeNull();
  unmount();
});
