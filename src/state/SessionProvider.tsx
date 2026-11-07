import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react';
import { releaseObjectUrl } from '../lib/objectUrl.ts';
import { count, type UsageEvent } from '../lib/usage.ts';
import type { PhotoSession } from '../lib/types.ts';
import { initialSession, sessionReducer, usageEvent, type SessionAction } from './session.ts';

interface SessionValue {
  session: PhotoSession;
  dispatch: Dispatch<SessionAction>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  children,
  initial = initialSession,
  onUsage = count,
}: {
  children: ReactNode;
  initial?: PhotoSession;
  onUsage?: (event: UsageEvent) => void;
}) {
  const [session, dispatch] = useReducer(sessionReducer, initial);

  // Usage ticks (scan, cloak), derived from state transitions.
  const prev = useRef(session);
  useEffect(() => {
    const event = usageEvent(prev.current, session);
    prev.current = session;
    if (event) onUsage(event);
  }, [session, onUsage]);

  // Release the decoded image as soon as it is replaced or the session resets.
  const { bitmap } = session;
  useEffect(() => () => bitmap?.close(), [bitmap]);

  const { file } = session;
  useEffect(
    () => () => {
      if (file) releaseObjectUrl(file);
    },
    [file],
  );

  const url = session.result?.url;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return <SessionContext.Provider value={{ session, dispatch }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
