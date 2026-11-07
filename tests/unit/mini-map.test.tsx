import { readFileSync } from 'node:fs';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MiniMap, project, ringsPath, worldRings, type World } from '../../src/components/MiniMap.tsx';
import { I18nProvider } from '../../src/i18n.tsx';

const world = worldRings(JSON.parse(readFileSync('public/geo/countries-110m.json', 'utf8')));

describe('MiniMap', () => {
  it('centres the target on the location', () => {
    expect(project(45.764, 4.8357)([4.8357, 45.764])).toEqual([160, 80]);
  });

  it('draws only the land near the point', () => {
    const lyon = ringsPath(world, 45.764, 4.8357);
    expect(lyon.length).toBeGreaterThan(100);
    expect(ringsPath(world, -30, -130)).toBe(''); // open South Pacific
  });

  it('renders the readouts and the outline once loaded', async () => {
    const load = () => Promise.resolve(world as World);
    render(
      <I18nProvider initial="en">
        <MiniMap lat={45.764} lon={4.8357} load={load} />
      </I18nProvider>,
    );
    expect(screen.getByText(/45\.7640° N/)).toBeInTheDocument();
    expect(screen.getByText(/4\.8357° E/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('land')).toBeInTheDocument());
  });

  it('southern and western hemispheres', () => {
    render(
      <I18nProvider initial="en">
        <MiniMap lat={-33.8688} lon={-70.6} load={() => new Promise(() => {})} />
      </I18nProvider>,
    );
    expect(screen.getByText(/33\.8688° S/)).toBeInTheDocument();
    expect(screen.getByText(/70\.6000° W/)).toBeInTheDocument();
  });
});
