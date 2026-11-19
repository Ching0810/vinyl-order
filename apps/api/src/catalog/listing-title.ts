/**
 * What a shop's own name for a record says (tracker.md §6.2): the shops put
 * the artist, the format, the edition and the release date into one title,
 * each its own way. These readings are a prefill and a filter, never the
 * record itself: the add form shows them for correction, and the listing's
 * title is kept as the shop wrote it (`sourceTitle`).
 *
 * The shapes, from the shops' catalogs (2026-11):
 *
 * - THT: `Artist - Title 2LP 藍色彩膠 (2027/2/17發行預訂）`
 * - Cosmic: `Artist - Title【藍色彩膠｜…】（黑膠唱片 LP）`, `…【日盤】（CD）`
 * - Rotten Blues: `【日版CD】Artist《Title》譯名`, `【黑膠】Artist《Title》`
 */

export interface ListingTitle {
  /** The artist part, as written; null when the title has no artist part. */
  artist: string | null;
  /** The record's name, without the artist, format, edition or date. */
  title: string;
  /** e.g. `LP`, `2LP`, `CD`; null when the title names none. */
  format: string | null;
  /** What tells this pressing apart, e.g. `藍色彩膠`, `日版`. */
  edition: string | null;
  /**
   * Vinyl unless the title names another format: most listings at these
   * shops are records, and a record wrongly hidden from search is worse
   * than a CD wrongly shown (tracker.md §7.2).
   */
  isVinyl: boolean;
  isUsed: boolean;
  /** The title says it is on pre-order or to be restocked. */
  isPreOrder: boolean;
  /** The release or restock date the title gives, if any. */
  expected: ExpectedDate | null;
}

export interface ExpectedDate {
  /** `YYYY-MM-DD`; a month alone is its last day. */
  at: string;
  /** The words it was read from, for the page to show beside the date. */
  note: string;
}

/** The words that make a bracketed note a date, not part of the name. */
const DATE_NOTE = /預訂|預購|發行|出貨|補貨|到貨/;
const PRE_ORDER = /預購|預訂|預約/;
const USED = /二手|中古|\bused\b/i;

/**
 * What else the shops sell, as their titles name it: merchandise, calendars,
 * magazines, scores, books, players. Flagged so search can hide them.
 */
const OTHER_GOODS =
  /\b(?:MD|DVD|Blu-?ray|BOOK)\b|卡帶|周邊|週邊|年曆|月曆|雜誌|樂譜|硬體|專書|書籍|寫真/i;

/** Formats that are not vinyl. */
const NOT_VINYL = new RegExp(`^\\d*CD$|${OTHER_GOODS.source}`, 'i');

/** A format word at the end of THT's name: `LP`, `2LP`, `2 LP`, `7"`, `CD`. */
const TRAILING_FORMAT =
  /\s(\d?\s?LP|\d?\s?CD|EP|MD|DVD|Box(?:\s?Set)?|\d{1,2}(?:吋|"|''|”))(?:\s+(.*))?$/i;

/** Edition words in a 【…】 part: colours, pressings, regions. */
const EDITION = /版|盤|膠|限量|限定|初回|再版|復刻|180\s?g/i;

/** A spaced dash between artist and title; "Lo-Fi" and "Jay-Z" have none. */
const ARTIST_DASH = /\s*[-–—]\s+|\s+[-–—]\s*/;

const BRACKETED = /\(([^()]*)\)/g;
const LENTICULAR = /【([^【】]*)】/g;

/**
 * Read a shop's title.
 *
 * @param raw - the title as the shop wrote it
 * @param today - `YYYY-MM-DD` in Taipei, to give a year to "12月" or "11/20"
 */
export const readListingTitle = (raw: string, today: string): ListingTitle => {
  // Full-width brackets, bars and letters become half-width, so one pattern
  // reads "（CD）" and "(CD)" alike.
  let text = raw.normalize('NFKC').trim();
  const editions: string[] = [];
  let format: string | null = null;

  // The date note: "(2027/2/17發行預訂)", "(12月補貨預訂)".
  let expected: ExpectedDate | null = null;
  text = text.replace(BRACKETED, (whole: string, note: string) => {
    if (!DATE_NOTE.test(note)) return whole;
    expected ??= expectedFromNote(note.trim(), today);
    return ' ';
  });

  // Cosmic's format note at the end: "(黑膠唱片 2LP)", "(CD)".
  text = text.replace(/\(([^()]*)\)\s*$/, (whole: string, note: string) => {
    const named = formatNamed(note);
    if (!named) return whole;
    format = named;
    return ' ';
  });

  // 【…】 parts: Rotten Blues' "【日版CD】" before the artist, Cosmic's
  // "【藍色彩膠｜猜火車開場曲】" after the title. Only edition words are
  // kept; the rest is the shop's sales talk.
  text = text.replace(LENTICULAR, (_whole: string, part: string) => {
    for (const piece of part.split('|').map((each) => each.trim())) {
      const named = formatNamed(piece);
      if (named) {
        format ??= named;
        const rest = piece.replace(named === 'LP' ? /黑膠|LP/ : named, '').trim();
        if (rest && EDITION.test(rest)) editions.push(rest);
      } else if (EDITION.test(piece)) {
        editions.push(piece);
      }
    }
    return ' ';
  });
  text = text.replace(/\s+/g, ' ').trim();

  // Rotten Blues: Artist《Title》, then a translated name or the pressing
  // ("限量7吋透明彩膠EP"); a note after "※" is the shop's ("追加生產預購中").
  let artist: string | null = null;
  let title = text;
  const bracketed = /^(.*?)《([^》]+)》/.exec(text);
  if (bracketed) {
    artist = bracketed[1].trim() || null;
    title = bracketed[2].trim();
    const after = text.slice(bracketed[0].length).replace(/※.*$/, '').trim();
    if (EDITION.test(after)) {
      editions.push(after);
      // A size or format named here is surer than "【黑膠】".
      format = formatNamed(after) ?? format;
    }
  } else {
    const dash = ARTIST_DASH.exec(text);
    if (dash) {
      artist = text.slice(0, dash.index).trim() || null;
      title = text.slice(dash.index + dash[0].length).trim();
    }
    // THT: "Title 2LP 藍色彩膠" — the format, then any edition after it.
    const trailing = TRAILING_FORMAT.exec(title);
    if (trailing) {
      format ??= trailing[1].replace(/\s/g, '').toUpperCase();
      const after = trailing[2]?.replace(/^\(|\)$/g, '').trim();
      if (after) editions.push(after);
      title = title.slice(0, trailing.index).trim();
    }
  }

  return {
    artist,
    title,
    format,
    edition: editions.length > 0 ? editions.join(' ') : null,
    isVinyl: format === null || !NOT_VINYL.test(format),
    isUsed: USED.test(raw),
    isPreOrder: PRE_ORDER.test(raw),
    expected,
  };
};

/** The format a note or tag names: `黑膠唱片 2LP` → `2LP`, `日版CD` → `CD`. */
const formatNamed = (text: string): string | null => {
  const sized = /(\d?)\s?(LP|CD|EP)\b/i.exec(text);
  if (sized) return `${sized[1]}${sized[2].toUpperCase()}`;
  if (/黑膠/.test(text)) return 'LP';
  const other = OTHER_GOODS.exec(text);
  return other ? other[0] : null;
};

/**
 * The date a note gives. A day when it names one, else the month's last
 * day. A year written out is kept; otherwise it is this year if the month
 * hasn't passed, else next year — the rule confirmations use (§9.4).
 */
const expectedFromNote = (note: string, today: string): ExpectedDate | null => {
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));
  const yearOf = (month: number) => (month >= thisMonth ? thisYear : thisYear + 1);

  // "2027/2/17", "2027/3月", "2027/3"
  const full = /(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?/.exec(note);
  if (full) return dated(note, Number(full[1]), Number(full[2]), full[3]);

  // "11/20", "10/23" — a month and a day, no year
  const monthDay = /(?:^|\D)(\d{1,2})\/(\d{1,2})(?!\d)/.exec(note);
  if (monthDay) {
    const month = Number(monthDay[1]);
    return dated(note, yearOf(month), month, monthDay[2]);
  }

  // "12月", "12月底"
  const month = /(?:^|\D)(\d{1,2})\s*月/.exec(note);
  if (month) return dated(note, yearOf(Number(month[1])), Number(month[1]));

  // "本月補貨預訂"
  if (note.includes('本月')) return dated(note, thisYear, thisMonth);
  return null;
};

/** `YYYY-MM-DD`, or null when no calendar has that day. */
const dated = (note: string, year: number, month: number, day?: string): ExpectedDate | null => {
  if (month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayOfMonth = day === undefined ? last : Number(day);
  if (dayOfMonth < 1 || dayOfMonth > last) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return { at: `${year}-${pad(month)}-${pad(dayOfMonth)}`, note };
};

/** The script a character is written in, for splitting artist names. */
const isCjk = (char: string) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー]/u.test(char);

/**
 * The names in an artist part, for §5.7's aliases: split at "/" and where
 * the script changes between CJK and Latin, and between CJK words at a space
 * — "坂本龍一 Ryuichi Sakamoto" gives both, "ゲシュタルト乙女 格式塔少女 Gestalt
 * Girl" all three. Latin names keep their spaces. A proposal: the add form
 * shows it for correction ("坂本 龍一" would split wrongly).
 *
 * @param artist - the artist part of a title
 */
export const splitArtistNames = (artist: string): string[] => {
  const names: string[] = [];
  for (const part of artist.normalize('NFKC').split('/')) {
    let current = '';
    let currentIsCjk: boolean | null = null;
    for (const char of part) {
      if (/\s/.test(char)) {
        // A space ends a CJK name; inside a Latin one it is kept.
        if (currentIsCjk) {
          names.push(current);
          current = '';
          currentIsCjk = null;
        } else if (current) {
          current += char;
        }
        continue;
      }
      const letter = /\p{L}/u.test(char);
      const cjk: boolean | null = letter ? isCjk(char) : currentIsCjk;
      if (current && letter && currentIsCjk !== null && cjk !== currentIsCjk) {
        names.push(current);
        current = '';
      }
      current += char;
      if (letter) currentIsCjk = cjk;
    }
    names.push(current);
  }
  const trimmed = names.map((name) => name.trim()).filter(Boolean);
  return [...new Set(trimmed)];
};

/**
 * A name in search form, as `ArtistAlias.normalized` stores it: NFKC
 * (full-width to half-width), lower case, no punctuation, symbols or spaces.
 * "ＲＹＵＩＣＨＩ ＳＡＫＡＭＯＴＯ", in full width, and "Ryuichi Sakamoto" are one.
 */
export const normalizeName = (name: string): string =>
  name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '');
