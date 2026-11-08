import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZoneLayer } from '../../src/components/ZoneLayer.tsx';
import { I18nProvider } from '../../src/i18n.tsx';
import type { Zone } from '../../src/lib/types.ts';

const zones: Zone[] = [
  { id: 'face', kind: 'detected', category: 'face', rect: { x: 10, y: 10, w: 20, h: 20 }, selected: true },
  { id: 'm1', kind: 'manual', category: 'manual', rect: { x: 50, y: 50, w: 30, h: 20 }, selected: true },
];

function mount(over: Partial<Parameters<typeof ZoneLayer>[0]> = {}) {
  const props = {
    zones,
    width: 100,
    height: 100,
    onToggle: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  };
  render(
    <I18nProvider initial="en">
      <ZoneLayer {...props} />
    </I18nProvider>,
  );
  const layer = screen.getByTestId('zone-layer');
  // Displayed at 200 x 200 screen px: image px = screen px / 2.
  layer.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return { props, layer };
}

const pointer = (el: Element, type: string, x: number, y: number) =>
  fireEvent[type as 'pointerDown'](el, {
    pointerId: 1,
    clientX: x,
    clientY: y,
    button: 0,
    pointerType: 'touch',
  });

describe('ZoneLayer editing', () => {
  it('a tap toggles the zone under it (screen to image mapping)', () => {
    const { props, layer } = mount();
    pointer(layer, 'pointerDown', 40, 40); // image (20, 20) -> inside face
    pointer(layer, 'pointerUp', 41, 41);
    expect(props.onToggle).toHaveBeenCalledWith('face');
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('with the draw tool, a tap does not toggle', () => {
    const { props, layer } = mount({ tool: 'draw' });
    pointer(layer, 'pointerDown', 40, 40);
    pointer(layer, 'pointerUp', 41, 41);
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it('a tap on empty space does nothing', () => {
    const { props, layer } = mount();
    pointer(layer, 'pointerDown', 190, 10);
    pointer(layer, 'pointerUp', 190, 10);
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it('a drag draws a rectangle in image pixels', () => {
    const { props, layer } = mount();
    pointer(layer, 'pointerDown', 120, 20);
    pointer(layer, 'pointerMove', 160, 60);
    expect(screen.getByTestId('zone-draft')).toBeInTheDocument();
    pointer(layer, 'pointerUp', 160, 60);
    expect(props.onAdd).toHaveBeenCalledWith({ x: 60, y: 10, w: 20, h: 20 });
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it('dragging a corner handle of the hovered zone resizes it, once, on release', () => {
    const onResize = vi.fn();
    const { props, layer } = mount({ onResize, hover: 'face' });
    expect(screen.getAllByTestId('zone-handle')).toHaveLength(4);
    const se = screen.getAllByTestId('zone-handle').find((h) => h.dataset.handle === 'se')!;
    pointer(se, 'pointerDown', 60, 60);
    pointer(layer, 'pointerMove', 100, 80);
    expect(onResize).not.toHaveBeenCalled();
    pointer(layer, 'pointerUp', 100, 80);
    expect(onResize).toHaveBeenCalledWith('face', { x: 10, y: 10, w: 40, h: 30 });
    expect(props.onToggle).not.toHaveBeenCalled();
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('dragging a drawn zone moves it, kept inside the photo, once, on release', () => {
    const onResize = vi.fn();
    const { props, layer } = mount({ onResize });
    // m1 is at 50,50 (image px) = 100,100 screen px; drag it 20 image px right and 10 up.
    pointer(layer, 'pointerDown', 130, 120);
    pointer(layer, 'pointerMove', 170, 100);
    expect(onResize).not.toHaveBeenCalled();
    pointer(layer, 'pointerUp', 170, 100);
    expect(onResize).toHaveBeenCalledWith('m1', { x: 70, y: 40, w: 30, h: 20 });
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(props.onToggle).not.toHaveBeenCalled();

    onResize.mockClear();
    pointer(layer, 'pointerDown', 130, 120);
    pointer(layer, 'pointerMove', 400, 400);
    pointer(layer, 'pointerUp', 400, 400);
    expect(onResize).toHaveBeenCalledWith('m1', { x: 70, y: 80, w: 30, h: 20 });
  });

  it('a tap on a drawn zone still toggles it, and drags on detected zones still draw', () => {
    const onResize = vi.fn();
    const { props, layer } = mount({ onResize });
    pointer(layer, 'pointerDown', 130, 120);
    pointer(layer, 'pointerUp', 131, 121);
    expect(props.onToggle).toHaveBeenCalledWith('m1');
    pointer(layer, 'pointerDown', 30, 30);
    pointer(layer, 'pointerMove', 50, 50);
    pointer(layer, 'pointerUp', 50, 50);
    expect(props.onAdd).toHaveBeenCalledWith({ x: 15, y: 15, w: 10, h: 10 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('shows the move cursor on drawn zones only', () => {
    mount({ onResize: vi.fn() });
    const [face, m1] = screen.getAllByTestId('zone');
    expect(face!.className).not.toContain('cursor-move');
    expect(m1!.className).toContain('cursor-move');
  });

  it('shows no handles without a hovered zone', () => {
    mount({ onResize: vi.fn() });
    expect(screen.queryAllByTestId('zone-handle')).toHaveLength(0);
  });

  it('manual zones have a remove control, detected ones do not', () => {
    const { props } = mount();
    const remove = screen.getAllByTestId('zone-remove');
    expect(remove).toHaveLength(1);
    fireEvent.click(remove[0]!);
    expect(props.onRemove).toHaveBeenCalledWith('m1');
  });

  it('deselected zones say they stay visible, and the keyboard can toggle', () => {
    const { props } = mount({ zones: [{ ...zones[0]!, selected: false }] });
    const btn = screen.getByRole('button', { name: /Face: stays visible/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(props.onToggle).toHaveBeenCalledWith('face');
  });

  it('is display-only without handlers', () => {
    render(
      <I18nProvider initial="en">
        <ZoneLayer zones={zones} width={100} height={100} />
      </I18nProvider>,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
