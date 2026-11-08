import { useEffect, useSyncExternalStore } from 'react';
import { GlitchTransition } from './components/GlitchTransition.tsx';
import { Reticle } from './components/Reticle.tsx';
import { FlowHeader, SiteHeader } from './components/SiteHeader.tsx';
import { About } from './screens/About.tsx';
import { ErrorScreen } from './screens/ErrorScreen.tsx';
import { Landing } from './screens/Landing.tsx';
import { Result } from './screens/Result.tsx';
import { Review } from './screens/Review.tsx';
import { Scan } from './screens/Scan.tsx';
import type { Pipeline } from './state/usePipeline.ts';

const onHash = (cb: () => void) => {
  addEventListener('hashchange', cb);
  return () => removeEventListener('hashchange', cb);
};
const readHash = () => location.hash;

/** Which screen is showing, for transitions (cloaking stays on Review, scanned on Scan). */
export function screenKey(hash: string, state: string): string {
  if (hash === '#about') return 'about';
  if (state === 'decoding' || state === 'scanning' || state === 'scanned') return 'scan';
  if (state === 'reviewing' || state === 'cloaking') return 'review';
  return state;
}

export function AppView({ pipeline }: { pipeline: Pipeline }) {
  const { session, scanner } = pipeline;
  // The About page is a hash route so it works offline and never leaves the page (the photo stays in memory).
  const hash = useSyncExternalStore(onHash, readHash, () => '');
  let screen;
  if (hash === '#about') screen = <About onBack={() => (location.hash = '')} />;
  else
    switch (session.state) {
      case 'idle':
        screen = <Landing onPick={pipeline.pick} />;
        break;
      case 'decoding':
      case 'scanning':
      case 'scanned':
        screen = (
          <Scan
            session={session}
            scanner={scanner}
            onSkip={pipeline.skip}
            onContinue={pipeline.proceed}
            onRestart={pipeline.reset}
          />
        );
        break;
      case 'reviewing':
      case 'cloaking':
        screen = <Review session={session} onCloak={pipeline.cloak} onZones={pipeline.setZones} />;
        break;
      case 'result':
        screen = <Result session={session} onStartOver={pipeline.reset} onEditZones={pipeline.editZones} />;
        break;
      case 'error':
        screen = <ErrorScreen error={session.error} onRetry={pipeline.reset} />;
    }
  const key = screenKey(hash, session.state);
  // Section links (#privacy...) from the About page land on a page that was not there when the
  // browser looked for the anchor: scroll once it is rendered. The About page opens at its top.
  useEffect(() => {
    if (key === 'about') scrollTo(0, 0);
    else if (hash.length > 1) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [key, hash]);
  const step = key === 'scan' ? 1 : key === 'review' ? 2 : key === 'result' ? 3 : 0;
  const home = () => {
    pipeline.reset();
    if (location.hash) location.hash = '';
  };
  return (
    <div className="flex min-h-full flex-col pb-[env(safe-area-inset-bottom)]">
      {step ? (
        <FlowHeader step={step} ready={pipeline.offlineReady} onHome={home} />
      ) : (
        <SiteHeader ready={pipeline.offlineReady} />
      )}
      <main className="flex flex-1 flex-col">
        <GlitchTransition screen={key}>{screen}</GlitchTransition>
      </main>
      <Reticle />
    </div>
  );
}
