// One object URL per File, owned by the session (released in SessionProvider when the file changes).
const urls = new WeakMap<Blob, string>();

export function objectUrlFor(blob: Blob): string {
  let u = urls.get(blob);
  if (!u) {
    u = URL.createObjectURL(blob);
    urls.set(blob, u);
  }
  return u;
}

export function releaseObjectUrl(blob: Blob): void {
  const u = urls.get(blob);
  if (u) {
    URL.revokeObjectURL(u);
    urls.delete(blob);
  }
}
