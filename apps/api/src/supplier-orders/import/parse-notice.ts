import type { Supplier } from '@vinyl-order/shared';

import type { ConfirmationEmail } from './confirmation';
import { emailLines } from './email-text';
import type { NoticeRead, NoticeResult } from './notice';
import { readEasyStorePayment, readEasyStoreShipping } from './parsers/easystore-notices';
import { readShopifyShipping } from './parsers/shopify-notices';
import { sentDay, supplierOf } from './senders';

type NoticeReader = (lines: string[], sentOn: string) => NoticeRead;

/**
 * The notices read, per shop, by a part of the subject. One notice at a time,
 * each from its own samples. Cosmic is on THT's platform, but until one of
 * its notices is sampled, its notices are refused and marked by hand.
 */
const NOTICES: Partial<Record<Supplier, Record<string, NoticeReader>>> = {
  tht: {
    確認收款通知: readEasyStorePayment,
    更新訂單出貨通知: (lines) => readEasyStoreShipping(lines),
  },
  rotten_blues: {
    // "訂單 #3003 的貨件配送中".
    的貨件配送中: (lines) => readShopifyShipping(lines),
  },
};

/**
 * Read a shop's payment or shipping notice: which of my orders it is about,
 * and what it says happened.
 *
 * Refuses rather than guesses, as confirmations do (tracker.md §9.4): an
 * unknown sender, a subject no reader is written for, or a notice missing
 * its number or what it reports comes back with a reason.
 *
 * @param email - as the Apps Script sends it
 */
export const parseNotice = (email: ConfirmationEmail): NoticeResult => {
  const supplier = supplierOf(email.from);
  if (!supplier) return { ok: false, reason: 'not a sender whose emails are read' };

  const readers = NOTICES[supplier] ?? {};
  const subject = Object.keys(readers).find((known) => email.subject.includes(known));
  if (!subject) return { ok: false, reason: 'not a notice this site reads' };

  const sentOn = sentDay(email.date);
  if (!sentOn) return { ok: false, reason: 'no date' };

  const read = readers[subject](emailLines(email.html), sentOn);
  return read.ok ? { ok: true, notice: { ...read.notice, supplier } } : read;
};
