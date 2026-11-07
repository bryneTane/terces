import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// Usage ticks must never reach the network from unit tests.
if (typeof navigator !== 'undefined')
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: () => true });

// No real network from unit tests: tests that need fetch inject or stub their own.
if (typeof window !== 'undefined') {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    throw new TypeError(`unit tests must not fetch (${String(input)})`);
  }) as typeof fetch;
}
