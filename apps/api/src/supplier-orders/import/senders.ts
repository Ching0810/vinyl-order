import type { Supplier } from '@vinyl-order/shared';

/**
 * The senders whose emails are read, and the shop each stands for. Must match
 * the Apps Script's search (tools/gmail-import). Candlelight has none: its
 * mail comes from its payment provider and names no order (tracker.md §9.4).
 */
const SENDERS: Record<string, Supplier> = {
  'notifications+thtrecords@mail.easystore.co': 'tht',
  'notifications+universalvinylmusic@mail.easystore.co': 'cosmic',
  'store+100236001461@t.shopifyemail.com': 'rotten_blues',
};

/**
 * The shop a From header is from — `Name <a@b>` or a bare `a@b`, any case —
 * or null for anyone else.
 *
 * @param from - the email's From header
 */
export const supplierOf = (from: string): Supplier | null => {
  const address = (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
  return SENDERS[address] ?? null;
};

/** 'en-CA' formats a day as ISO, `YYYY-MM-DD`. */
const TAIPEI_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The day an email was sent, in Taipei, or null if its Date can't be read.
 *
 * @param date - the email's Date header, as an ISO datetime
 */
export const sentDay = (date: string): string | null => {
  const sent = new Date(date);
  return Number.isNaN(sent.getTime()) ? null : TAIPEI_DAY.format(sent);
};
