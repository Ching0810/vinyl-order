import type { NoticeRead } from '../notice';

/** "我們已經成功收取到您此訂單#1001的款項支付，…". */
const PAYMENT_ORDER_NUMBER = /此訂單\s*#\s*([A-Za-z0-9-]+)/;

/** "04/11/2026, 03:40 PM": day first, then month. */
const PAID_ON = /^(\d{2})\/(\d{2})\/(\d{4}),/;

/** A shipping notice's heading: "訂單 #1001", alone on its line. */
const SHIPPING_ORDER_NUMBER = /^訂單\s*#\s*([A-Za-z0-9-]+)$/;

/** "您的訂單物流狀態已更新。(已出貨)", either kind of bracket. */
const SHIPPING_STATUS = /物流狀態已更新。?\s*[(（]\s*(.+?)\s*[)）]/;

/** The one shipping status read; any other is refused, not guessed at. */
const SHIPPED = '已出貨';

/**
 * How long before its notice a payment may have been made. A transfer is
 * confirmed within days; a day months earlier is far likelier the date read
 * the wrong way round (11/04 for 4 November read as 11 April).
 */
const MAX_DAYS_BEFORE_NOTICE = 31;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one `YYYY-MM-DD` to a later one. */
const daysBetween = (earlier: string, later: string): number =>
  (Date.parse(later) - Date.parse(earlier)) / DAY_MS;

/** `YYYY-MM-DD`, or null for a day no calendar has (31/02). */
const isoDay = (year: string, month: string, day: string): string | null => {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const iso = date.toISOString().slice(0, 10);
  return iso === `${year}-${month}-${day}` ? iso : null;
};

/**
 * An EasyStore payment notice (THT): "確認收款通知".
 *
 * The day comes from "支付日期", not from the email's Date: they agree for a
 * card, but a transfer is confirmed later than it was made. EasyStore writes
 * it day first ("04/11/2026" came on 4 November). A day after the email's
 * own, or more than a month before it, most likely means it was written the
 * other way round, and is refused rather than read months off (tracker.md
 * §9.5). Its lines and totals are not read: a notice moves an order, it
 * never records one.
 *
 * @param lines - the email's text lines (emailLines)
 * @param sentOn - the email's own day in Taipei, `YYYY-MM-DD`
 */
export const readEasyStorePayment = (lines: string[], sentOn: string): NoticeRead => {
  const orderNumber = lines.map((line) => PAYMENT_ORDER_NUMBER.exec(line)?.[1]).find(Boolean);
  if (!orderNumber) return { ok: false, reason: 'no order number found' };

  const at = lines.indexOf('支付日期');
  const written = at === -1 ? null : PAID_ON.exec(lines[at + 1] ?? '');
  const paidAt = written && isoDay(written[3], written[2], written[1]);
  if (!paidAt) return { ok: false, reason: 'no payment day found' };
  // ISO days compare as strings.
  if (paidAt > sentOn) return { ok: false, reason: 'the payment day is after the email' };
  if (daysBetween(paidAt, sentOn) > MAX_DAYS_BEFORE_NOTICE) {
    return { ok: false, reason: 'the payment day is over a month before the email' };
  }

  return { ok: true, notice: { kind: 'paid', orderNumber, paidAt } };
};

/**
 * An EasyStore shipping notice (THT): "更新訂單出貨通知".
 *
 * The template has one place for the status; only "已出貨" is read. Its
 * lines are not read.
 *
 * @param lines - the email's text lines (emailLines)
 */
export const readEasyStoreShipping = (lines: string[]): NoticeRead => {
  const orderNumber = lines.map((line) => SHIPPING_ORDER_NUMBER.exec(line)?.[1]).find(Boolean);
  if (!orderNumber) return { ok: false, reason: 'no order number found' };

  const status = lines.map((line) => SHIPPING_STATUS.exec(line)?.[1]).find(Boolean);
  if (!status) return { ok: false, reason: 'no shipping status found' };
  if (status !== SHIPPED) return { ok: false, reason: 'a shipping status this site does not read' };

  return { ok: true, notice: { kind: 'shipped', orderNumber } };
};
