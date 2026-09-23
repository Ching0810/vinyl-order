/**
 * Date formatting.
 *
 * Both the locale and the time zone are pinned, for the reason formatPrice pins
 * its locale: this runs in the server render and again in the browser, and a
 * value that differs between the two — a visitor in another time zone sees a
 * different hour — is a hydration mismatch. The shop is in Taiwan, so its
 * dates read in Taiwan time.
 */
const dateTimeFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Format an ISO timestamp from the API (e.g. an order's `createdAt`) as a date
 * and time in shop time.
 *
 * @param iso - ISO 8601 string, as the contracts carry dates
 */
export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));
