// "Add to home screen". Chrome, Edge and Samsung Internet send `beforeinstallprompt`, which is
// kept here (it can fire before React mounts, so this module listens from the start) and shown
// from our own button. Other browsers have no such event (and Chrome sends it only once it judges
// the page installable): the button then explains the browser's own steps. Once installed, nothing shows.
import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * prompt: the browser's dialog. ios: Share > Add to Home Screen (every iPhone/iPad browser).
 * mac: Safari's File > Add to Dock. menu: the browser menu's install item. none: cannot install.
 */
export type InstallWay = 'prompt' | 'ios' | 'mac' | 'menu' | 'none' | null;

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Running from the home screen already. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** How to install by hand in this browser (iPadOS reports a Mac with touch). */
export function manualWay(ua: string, touchPoints: number): Exclude<InstallWay, 'prompt' | null> {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
  const chromium = /Chrome|Chromium|CriOS|Edg/.test(ua);
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !chromium && !/Firefox/.test(ua)) return 'mac';
  // Firefox on computers has no way to install a web app; on Android its menu has one.
  if (/Firefox\//.test(ua) && !/Android/.test(ua)) return 'none';
  return 'menu';
}

if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

function way(): InstallWay {
  if (installed || isStandalone()) return null;
  if (deferred) return 'prompt';
  return manualWay(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** How this browser can install the app now, if at all. */
export function useInstallWay(): InstallWay {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    way,
    () => null,
  );
}

/** Shows the browser's own install dialog (only when the way is 'prompt'). */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  notify();
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted';
}
