// The only data that leaves the device: a bare "scan" or "cloak" tick to our own origin.
export type UsageEvent = 'scan' | 'cloak';

export function count(event: UsageEvent): void {
  try {
    if (typeof navigator === 'undefined' || navigator.onLine === false) return;
    if (location.pathname.endsWith('/lab.html')) return;
    // The dev server has no Functions, and dev sessions should not be counted.
    if (import.meta.env.MODE === 'development') return;
    if (
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/hit', new Blob([event], { type: 'text/plain' }))
    )
      return;
    void fetch('/api/hit', {
      method: 'POST',
      body: event,
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain' },
    }).catch(() => {});
  } catch {
    // Counting must never affect the app.
  }
}
