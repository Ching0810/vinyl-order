/**
 * An amount as the emails write it — `880`, `2,199`, `1,180.00` — in minor
 * units, or null if it isn't one. Thousands separators go; up to two decimals
 * are cents. TWD is priced in whole dollars, but Shopify writes `.00`.
 *
 * @param text - the digits, without currency
 */
export const toCents = (text: string): number | null => {
  const match = /^(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const whole = Number(match[1].replaceAll(',', ''));
  const fraction = Number((match[2] ?? '0').padEnd(2, '0'));
  return whole * 100 + fraction;
};

/**
 * A line total split back into a price per copy. The emails give a line's
 * total, not its unit price; null when it doesn't divide evenly, which would
 * mean the line isn't what it seems.
 *
 * @param lineTotalCents - what the line cost
 * @param quantity - how many copies
 */
export const unitPriceCents = (lineTotalCents: number, quantity: number): number | null =>
  lineTotalCents % quantity === 0 ? lineTotalCents / quantity : null;
