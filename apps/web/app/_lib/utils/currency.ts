/**
 * Money formatting.
 *
 * Prices are stored as integer cents everywhere (see the Product model) to keep
 * float rounding out of the domain, so display is always a cents → string
 * conversion rather than a raw number render.
 */

/**
 * Whole dollars with thousands separators. TWD is priced in whole dollars in
 * practice — every shop shows "NT$ 880", never "$880.00".
 */
const wholeDollars = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });

/**
 * Format integer cents as a price, e.g. 74_000 TWD → "NT$740".
 *
 * TWD is written out by hand rather than with `style: 'currency'`: under
 * zh-TW, Intl renders it as "$740.00", whose "$" reads as US dollars, and
 * the symbol and decimals it picks depend on the runtime's ICU data. Building
 * the string here makes it the same on the server, in every browser, and in
 * tests. Other currencies keep Intl's formatting.
 *
 * The locale is pinned rather than taken from the browser on purpose: this runs
 * in both the server and client render, and a locale that differs between the
 * two produces different text for the same product — a hydration mismatch.
 *
 * @param priceCents - amount in the currency's minor unit
 * @param currency - ISO 4217 code stored on the product (e.g. "TWD")
 */
export const formatPrice = (priceCents: number, currency: string): string => {
  if (currency === 'TWD') return `NT$${wholeDollars.format(priceCents / 100)}`;
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency }).format(priceCents / 100);
};
