import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '../../src/i18n.tsx';
import { ProgressBar } from '../../src/components/ProgressBar.tsx';

const wrap = (ui: ReactNode) => render(<I18nProvider initial="en">{ui}</I18nProvider>);

describe('ProgressBar', () => {
  it('clamps and exposes the value', () => {
    wrap(<ProgressBar value={1.4} label="Loading" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});
