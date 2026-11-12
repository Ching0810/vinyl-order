import { type Supplier, isAllowedCoverUrl } from '@vinyl-order/shared';

import type { ConfirmationEmail, ParseResult, PlatformParse } from './confirmation';
import { emailLines } from './email-text';
import { expectedMonthFromTitle } from './expected-month';
import { easyStoreCovers, parseEasyStore } from './parsers/easystore';
import { parseShopify, shopifyCovers } from './parsers/shopify';

/** How a platform reads its email, and where it puts the covers. */
interface Platform {
  parse: (lines: string[], subject: string) => PlatformParse;
  /** The images beside the order's lines, in line order. */
  covers: (html: string) => string[];
}

const EASYSTORE: Platform = { parse: (lines) => parseEasyStore(lines), covers: easyStoreCovers };
const SHOPIFY: Platform = { parse: parseShopify, covers: shopifyCovers };

/**
 * The senders whose confirmations are read, and what they are. Must match
 * the Apps Script's search (tools/gmail-import). Candlelight has none: its
 * mail comes from its payment provider and names no order (tracker.md §9.4).
 */
const SENDERS: Record<string, { supplier: Supplier; platform: Platform }> = {
  'notifications+thtrecords@mail.easystore.co': { supplier: 'tht', platform: EASYSTORE },
  'notifications+universalvinylmusic@mail.easystore.co': {
    supplier: 'cosmic',
    platform: EASYSTORE,
  },
  'store+100236001461@t.shopifyemail.com': { supplier: 'rotten_blues', platform: SHOPIFY },
};

/** The address in a From header: `Name <a@b>` or a bare `a@b`, lowercased. */
const senderAddress = (from: string): string =>
  (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();

/** The Taipei day of an instant, `YYYY-MM-DD` ('en-CA' formats as ISO). */
const taipeiDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The cover, if it is from one of the shops' own image hosts
 * (isAllowedCoverUrl, tracker.md §9.4); else null. Anything else — a
 * tracking redirect, a host a forged email names — is dropped, so the page
 * never loads an image from wherever an email points.
 */
const allowedCover = (src: string): string | null => (isAllowedCoverUrl(src) ? src : null);

/**
 * Read a shop's order confirmation into the order it confirms.
 *
 * Refuses rather than guesses (tracker.md §9.4): an unknown sender, an email
 * that isn't a confirmation, or one missing its number, lines or total comes
 * back with a reason, and is left for typing by hand.
 *
 * A cover is matched to a line only when the platform found exactly one per
 * line, in order; any other count leaves them all null rather than pairing
 * a record with another's picture.
 *
 * @param email - as the Apps Script sends it
 */
export const parseConfirmation = (email: ConfirmationEmail): ParseResult => {
  const sender = SENDERS[senderAddress(email.from)];
  if (!sender) return { ok: false, reason: 'not a sender whose emails are read' };
  // Shipping notices come from the same senders; only a confirmation records.
  if (!email.subject.includes('已確認')) return { ok: false, reason: 'not an order confirmation' };

  const sent = new Date(email.date);
  if (Number.isNaN(sent.getTime())) return { ok: false, reason: 'no date' };
  const orderedAt = taipeiDay.format(sent);

  const read = sender.platform.parse(emailLines(email.html), email.subject);
  if (!read.ok) return read;

  // Paired by position, so only when there is one per line; a disallowed host
  // still holds its line's place, and that line just gets none.
  const covers = sender.platform.covers(email.html);
  const coverFor = (index: number): string | null =>
    covers.length === read.lines.length ? allowedCover(covers[index]) : null;

  return {
    ok: true,
    order: {
      supplier: sender.supplier,
      orderNumber: read.orderNumber,
      orderedAt,
      totalCents: read.totalCents,
      paidAt: read.paidInFull ? orderedAt : null,
      items: read.lines.map((line, index) => {
        return {
          ...line,
          expectedMonth: expectedMonthFromTitle(line.title, orderedAt),
          imageUrl: coverFor(index),
        };
      }),
    },
  };
};
