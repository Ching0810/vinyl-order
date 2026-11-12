/**
 * Words that mark a bracketed note in a title as a release or restock date,
 * not part of the record's name ("(2015-2025)" is a span of years, not one).
 */
const DATE_NOTE = /預訂|預購|發行|出貨|補貨/;

/** A bracketed note, half- or full-width brackets in any pairing. */
const NOTE = /[(（]([^()（）]*)[)）]/g;

/** "12月", "10/23" — the month a note names, first match wins. */
const MONTH = /(?:^|[^\d])(\d{1,2})\s*(?:月|\/\d{1,2})/;

/**
 * The month a shop's title says a record is expected, as `YYYY-MM`, or null.
 *
 * THT writes it into the title: "(12月補貨預訂)", "(10/23發行預訂）". Only a
 * month is taken, as everywhere (tracker.md §5.5). The title names no year,
 * so it is the year of the order if the month hasn't passed by then, else the
 * next: ordered in November, "1月" is January next year.
 *
 * @param title - the line's title as the email wrote it
 * @param orderedAt - the order's day, `YYYY-MM-DD`
 */
export const expectedMonthFromTitle = (title: string, orderedAt: string): string | null => {
  for (const [, note] of title.matchAll(NOTE)) {
    if (!DATE_NOTE.test(note)) continue;
    const match = MONTH.exec(note);
    if (!match) continue;
    const month = Number(match[1]);
    if (month < 1 || month > 12) continue;

    const orderYear = Number(orderedAt.slice(0, 4));
    const orderMonth = Number(orderedAt.slice(5, 7));
    const year = month >= orderMonth ? orderYear : orderYear + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  return null;
};
