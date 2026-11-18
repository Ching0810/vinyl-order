import { type Supplier, isAllowedCoverUrl } from '@vinyl-order/shared';

import type { ConfirmationEmail, ParseResult, PlatformParse } from './confirmation';
import { emailLines } from './email-text';
import { expectedMonthFromTitle } from './expected-month';
import { easyStoreCovers, parseEasyStore } from './parsers/easystore';
import { parseShopify, shopifyCovers } from './parsers/shopify';
import { sentDay, supplierOf } from './senders';

/** How a platform reads its email, and where it puts the covers. */
interface Platform {
  parse: (lines: string[], subject: string) => PlatformParse;
  /** The images beside the order's lines, in line order. */
  covers: (html: string) => string[];
}

const EASYSTORE: Platform = { parse: (lines) => parseEasyStore(lines), covers: easyStoreCovers };
const SHOPIFY: Platform = { parse: parseShopify, covers: shopifyCovers };

/** The platform each shop's confirmation is written by (senders.ts names the shops). */
const PLATFORMS: Partial<Record<Supplier, Platform>> = {
  tht: EASYSTORE,
  cosmic: EASYSTORE,
  rotten_blues: SHOPIFY,
};

/**
 * The cover, if it is from one of the shops' own image hosts
 * (isAllowedCoverUrl, tracker.md §9.4); else null. Anything else — a
 * tracking redirect, a host a forged email names — is dropped, so the page
 * never loads an image from wherever an email points.
 */
const allowedCover = (src: string): string | null => (isAllowedCoverUrl(src) ? src : null);

/**
 * Whether an email is an order confirmation, by its subject: every shop's
 * says "已確認" ("您的訂單已確認。", "訂單 #3003 已確認"), and no notice's
 * does. Anything else is read as a notice, if at all.
 *
 * @param email - as the Apps Script sends it
 */
export const isConfirmation = (email: Pick<ConfirmationEmail, 'subject'>): boolean =>
  email.subject.includes('已確認');

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
  const supplier = supplierOf(email.from);
  const platform = supplier && PLATFORMS[supplier];
  if (!supplier || !platform) return { ok: false, reason: 'not a sender whose emails are read' };
  // Payment and shipping notices come from the same senders (parse-notice.ts);
  // only a confirmation records.
  if (!isConfirmation(email)) return { ok: false, reason: 'not an order confirmation' };

  const orderedAt = sentDay(email.date);
  if (!orderedAt) return { ok: false, reason: 'no date' };

  const read = platform.parse(emailLines(email.html), email.subject);
  if (!read.ok) return read;

  // Paired by position, so only when there is one per line; a disallowed host
  // still holds its line's place, and that line just gets none.
  const covers = platform.covers(email.html);
  const coverFor = (index: number): string | null =>
    covers.length === read.lines.length ? allowedCover(covers[index]) : null;

  return {
    ok: true,
    order: {
      supplier,
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
