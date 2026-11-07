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

/** Days carry no time or zone, so they are formatted in UTC, where they were parsed. */
const dayFormat = new Intl.DateTimeFormat('zh-TW', { timeZone: 'UTC', dateStyle: 'medium' });

/**
 * Format a calendar day from the API (e.g. a supplier order's `orderedAt`,
 * `YYYY-MM-DD`) for display.
 *
 * Not through formatDateTime: that reads a moment and shows it in Taipei time,
 * but a day is not a moment. Parsed as midnight UTC and shown in UTC, it is the
 * same day wherever this runs — parsed as local time, a browser west of UTC
 * would show the day before.
 *
 * @param day - `YYYY-MM-DD`
 */
export const formatDay = (day: string): string => dayFormat.format(new Date(`${day}T00:00:00Z`));

const monthFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
});

/**
 * Format a month from the API (a supplier order line's `expectedMonth`,
 * `YYYY-MM`) as e.g. "2026年11月" — the month alone, as the shop promised it.
 * Read in UTC for the reason formatDay is: the 1st it is parsed as is only a
 * handle, and must not slip into the month before.
 *
 * @param month - `YYYY-MM`
 */
export const formatMonth = (month: string): string =>
  monthFormat.format(new Date(`${month}-01T00:00:00Z`));

/** en-CA formats a date as `YYYY-MM-DD`, the shape a day crosses the wire in. */
const isoDayInTaipei = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' });

/**
 * Today in shop time, as `YYYY-MM-DD` — what a date input and the API take.
 * In Taipei rather than the browser's zone, as formatDateTime is: the shops
 * date their orders in Taiwan.
 */
export const todayInTaipei = (): string => isoDayInTaipei.format(new Date());

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
