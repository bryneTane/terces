import { describe, expect, it, vi } from 'vitest';
import { cloakedFilename, shareOrDownload } from '../../src/lib/share.ts';

const blob = new Blob(['x'], { type: 'image/jpeg' });

describe('share', () => {
  it('names files by date, never by the original name', () => {
    expect(cloakedFilename(new Date(2026, 10, 7, 9, 5))).toBe('terces-cloaked-20261107-0905.jpg');
  });

  it('uses the native share sheet when files are shareable', async () => {
    const share = vi.fn(async () => {});
    const nav = { canShare: () => true, share } as unknown as Navigator;
    expect(await shareOrDownload(blob, 'a.jpg', nav)).toBe('shared');
    expect(share).toHaveBeenCalledOnce();
  });

  it('treats a dismissed sheet as a cancel', async () => {
    const nav = {
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('dismissed', 'AbortError');
      }),
    } as unknown as Navigator;
    expect(await shareOrDownload(blob, 'a.jpg', nav)).toBe('cancelled');
  });

  it('downloads when sharing files is unsupported', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    expect(await shareOrDownload(blob, 'a.jpg', {} as Navigator)).toBe('downloaded');
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });
});
