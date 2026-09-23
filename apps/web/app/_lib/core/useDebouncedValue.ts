'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value` delayed by `delayMs`, only updating once it stops changing for
 * that long. Each new value resets the timer, so rapid typing doesn't fire — the
 * debounced value settles `delayMs` after the user's final keystroke.
 */
export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
};
