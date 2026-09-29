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

/**
 * Format a remaining duration as `m:ss`, e.g. 754_000 → "12:34". Rounded up,
 * so the last second reads "0:01" rather than "0:00" while time is still left.
 *
 * @param ms - milliseconds remaining
 */
export const formatCountdown = (ms: number): string => {
  const totalSeconds = Math.ceil(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};
