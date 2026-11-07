import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Admin, type State } from '../../src/admin/Admin.tsx';
import { BarChart, niceMax } from '../../src/admin/Chart.tsx';

const days = Array.from({ length: 30 }, (_, i) => ({
  day: `2026-10-${String(30 - i).padStart(2, '0')}`,
  scan: i === 0 ? 12 : 0,
  cloak: i === 0 ? 9 : 0,
}));
const chart = () => render(<BarChart days={days} />).container;

test('two bars per day', () => {
  const svg = chart();
  expect(svg.querySelectorAll('rect.bar.scan')).toHaveLength(30);
  expect(svg.querySelectorAll('rect.bar.cloak')).toHaveLength(30);
});

test('zero days have zero-height bars and the newest day is on the right', () => {
  const groups = chart().querySelectorAll('g[data-day]');
  expect(groups[0]!.getAttribute('data-day')).toBe('2026-10-01');
  expect(groups[29]!.getAttribute('data-day')).toBe('2026-10-30');
  expect(groups[0]!.querySelector('rect')!.getAttribute('height')).toBe('0');
  expect(Number(groups[29]!.querySelector('rect.scan')!.getAttribute('height'))).toBeGreaterThan(0);
});

test('axis labels: nice maximum and day ticks', () => {
  const labels = [...chart().querySelectorAll('text.axis')].map((t) => t.textContent);
  expect(labels).toContain('20');
  expect(labels).toContain('0');
  expect(labels).toContain('10-30');
});

test('niceMax', () => {
  expect([0, 1, 3, 12, 99, 101, 4999].map(niceMax)).toEqual([1, 1, 5, 20, 100, 200, 5000]);
});

test('the dashboard shows the tiles and the chart once loaded', async () => {
  const stats = { today: days[0]!, days, total: { scan: 1200, cloak: 900 }, cloakRate: 0.75 };
  render(<Admin load={async (): Promise<State> => ({ kind: 'ready', stats })} />);
  expect(await screen.findByRole('heading', { name: 'Terces usage' })).toBeInTheDocument();
  expect(screen.getByText('1,200')).toBeInTheDocument();
  expect(screen.getByText('75%')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Scans and cloaks per day, last 30 days' })).toBeInTheDocument();
});

test('an error is shown as text', async () => {
  render(<Admin load={async (): Promise<State> => ({ kind: 'error', message: 'Not authorized.' })} />);
  expect(await screen.findByText('Not authorized.')).toHaveClass('error');
});
