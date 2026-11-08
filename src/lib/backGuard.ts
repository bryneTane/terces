// While a photo is open, the browser's back button stays in the app: the whole flow is one page,
// so going back would leave the site and lose the photo (in an installed app, close it).
import { useEffect } from 'react';

const GUARD = 'terces-guard';
const isGuard = (state: unknown) => (state as { [GUARD]?: boolean } | null)?.[GUARD] === true;
const push = () => history.pushState({ [GUARD]: true }, '', location.href);

/**
 * Keeps a guard entry above the page's own entry while `active`. Back lands on the page's entry
 * and puts the guard back, so nothing changes on screen. Hash links (the #about route) add entries
 * above the guard and go back normally: they also fire popstate, but at another address, so they
 * are left alone. Browsers may let a second, quick back through (an entry pushed without a tap or
 * click can be skipped); `beforeunload` then asks before the photo is lost.
 */
export function useBackGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const below = location.href;
    if (!isGuard(history.state)) push();
    const onPop = (e: PopStateEvent) => {
      if (!isGuard(e.state) && location.href === below) push();
    };
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('popstate', onPop);
    addEventListener('beforeunload', onUnload);
    return () => {
      removeEventListener('popstate', onPop);
      removeEventListener('beforeunload', onUnload);
    };
  }, [active]);
}
