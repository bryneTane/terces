// Share through the native sheet (Web Share with files), falling back to a download.

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded';

export function cloakedFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `terces-cloaked-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.jpg`;
}

export function download(blob: Blob, filename: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function shareOrDownload(
  blob: Blob,
  filename: string,
  nav: Navigator = navigator,
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type });
  if (
    typeof nav.canShare === 'function' &&
    typeof nav.share === 'function' &&
    nav.canShare({ files: [file] })
  ) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  download(blob, filename);
  return 'downloaded';
}
