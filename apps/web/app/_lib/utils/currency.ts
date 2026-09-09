/**
 * Money formatting.
 *
 * Prices are stored as integer cents everywhere (see the Product model) to keep
 * float rounding out of the domain, so display is always a cents → string
 * conversion rather than a raw number render.
 */

/**
 * Format integer cents as a currency string under the pinned zh-TW locale.
 *
 * Note the exact glyph and decimal count depend on the runtime's ICU data — a
 * Node build with full ICU renders TWD as "NT$1,280", a small-icu build falls
 * back to "$1,280.00". Don't assert on the literal string in tests.
 *
 * The locale is pinned rather than taken from the browser on purpose: this runs
 * in both the server and client render, and a locale that differs between the
 * two produces different text for the same product — a hydration mismatch.
 *
 * @param priceCents - amount in the currency's minor unit
 * @param currency - ISO 4217 code stored on the product (e.g. "TWD")
 */
export const formatPrice = (priceCents: number, currency: string): string =>
  new Intl.NumberFormat('zh-TW', { style: 'currency', currency }).format(priceCents / 100);

export default formatPrice;
