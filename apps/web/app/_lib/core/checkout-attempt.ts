/**
 * The id of the checkout attempt in progress.
 *
 * An attempt is one press of "Place order" plus any retries of that press, and
 * the browser is what decides two requests are the same attempt: it keeps the
 * key between them. The server only ever compares keys.
 *
 * It lives in sessionStorage rather than a ref so it survives a reload — which
 * is exactly what someone does when a checkout appears to hang, and the moment
 * the key matters most. sessionStorage, not localStorage: an attempt belongs
 * to the tab that started it and should not outlive it.
 *
 * See docs/design/idempotency.md §8.
 */
const STORAGE_KEY = 'checkout-attempt';

/**
 * The current attempt's key, creating one if this is a fresh attempt.
 *
 * Storage can throw or be unavailable (private windows, blocked site data), so
 * a failure falls back to a one-off key: checkout still works, and only the
 * retry protection is lost.
 */
export const currentAttemptKey = (): string => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) return stored;

    const created = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
};

/**
 * Finish the attempt, so the next checkout is a new one with its own key.
 *
 * Called when the answer is definite — the order was placed, or the server
 * refused for a reason the customer must act on. A lost response is *not*
 * definite, so the key is kept there: pressing again then asks "did my earlier
 * request land?" and is answered with the order.
 */
export const endAttempt = (): void => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
};
