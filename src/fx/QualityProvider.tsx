import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { QualityGovernor, detectEnv, type Tier } from './quality.ts';

interface QualityValue {
  tier: Tier;
  governor: QualityGovernor;
}

const QualityContext = createContext<QualityValue | null>(null);

/** One governor for the whole app. `forceTier` pins a tier (tests, `?fx=static`). */
export function QualityProvider({ children, forceTier }: { children: ReactNode; forceTier?: Tier }) {
  const [governor] = useState(() => {
    const env = detectEnv();
    const pinned =
      forceTier ??
      (typeof location !== 'undefined'
        ? (new URLSearchParams(location.search).get('fx') as Tier | null)
        : null);
    return new QualityGovernor(pinned === 'static' ? { ...env, webgl2: false } : env);
  });
  const [tier, setTier] = useState<Tier>(forceTier ?? governor.tier);

  useEffect(() => {
    if (forceTier) return;
    const off = governor.subscribe(setTier);
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const onMotion = () => mq?.matches && governor.setReducedMotion(true);
    mq?.addEventListener?.('change', onMotion);
    return () => {
      off();
      mq?.removeEventListener?.('change', onMotion);
    };
  }, [governor, forceTier]);

  return (
    <QualityContext.Provider value={{ tier: forceTier ?? tier, governor }}>
      {children}
    </QualityContext.Provider>
  );
}

export function useQuality(): QualityValue {
  const v = useContext(QualityContext);
  if (v) return v;
  // Outside a provider (isolated component tests): no animation.
  return { tier: 'static', governor: new QualityGovernor({ webgl2: false, reducedMotion: true }) };
}
