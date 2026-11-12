import type { Supplier } from '@vinyl-order/shared';

/**
 * One confirmation email as the Apps Script sends it (tracker.md §9.4): the
 * headers that matter and the HTML body, links already removed.
 */
export interface ConfirmationEmail {
  /** The From header, e.g. `THT唱片 <notifications+thtrecords@mail.easystore.co>`. */
  from: string;
  subject: string;
  /** The Date header, as an ISO datetime. */
  date: string;
  html: string;
}

/** One line of an order, as read from the email. */
export interface ParsedLine {
  /** As the shop wrote it, with any variant ("預購, LP") after a slash. */
  title: string;
  quantity: number;
  unitPriceCents: number;
  expectedMonth: string | null;
  /** The cover shown beside it, from an allowed CDN, or null. */
  imageUrl: string | null;
}

/** The order an email confirms, ready to record. */
export interface ParsedOrder {
  supplier: Supplier;
  orderNumber: string;
  /** `YYYY-MM-DD`, the email's day in Taipei. */
  orderedAt: string;
  totalCents: number;
  /**
   * The order's day if the email says the whole total was paid at checkout,
   * else null — unpaid until the user, or a payment notice, says otherwise
   * (tracker.md §9.1).
   */
  paidAt: string | null;
  items: ParsedLine[];
}

/**
 * What reading an email came to: the order, or why it couldn't be read. A
 * reason is a short phrase for the 422 and the logs — never a quote of the
 * email, which carries personal details.
 */
export type ParseResult = { ok: true; order: ParsedOrder } | { ok: false; reason: string };

/** A line as a platform's parser reads it: what the email states outright. */
export type StatedLine = Pick<ParsedLine, 'title' | 'quantity' | 'unitPriceCents'>;

/**
 * A platform's reading of its email's lines. Months and covers are worked out
 * afterwards, the same way for every platform.
 */
export type PlatformParse =
  | {
      ok: true;
      orderNumber: string;
      totalCents: number;
      /** Whether the email says the whole total was paid when ordering. */
      paidInFull: boolean;
      lines: StatedLine[];
    }
  | { ok: false; reason: string };
