'use client';

import { useSyncExternalStore } from 'react';

const TICK_MS = 1_000;

const subscribe = (onTick: () => void) => {
  const timer = setInterval(onTick, TICK_MS);
  return () => clearInterval(timer);
};

// Rounded to the tick, so repeated reads within one second return the same
// value — useSyncExternalStore re-renders whenever the snapshot changes.
const getSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

// The server has no "now" worth rendering: its clock and the visitor's differ,
// so any countdown it printed would mismatch on hydration.
const getServerSnapshot = () => null;

/**
 * Milliseconds left until `deadline`, ticking once a second; 0 once it has
 * passed.
 *
 * Null during the server render and hydration, then the real value — so the
 * caller renders nothing time-dependent until it is in the browser.
 *
 * @param deadline - ISO 8601 timestamp, as the contracts carry dates
 */
export const useCountdown = (deadline: string): number | null => {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return now === null ? null : Math.max(0, Date.parse(deadline) - now);
};
