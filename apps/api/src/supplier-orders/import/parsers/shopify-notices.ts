import type { NoticeRead } from '../notice';

/** The email's heading: "訂單 #3003", alone on its line. */
const ORDER_NUMBER = /^訂單\s*#\s*([A-Za-z0-9-]+)$/;

/** The notice's own heading, which says what happened. */
const ON_ITS_WAY = '您的訂單配送中';

/** "7-11 追蹤編號: H00000000001": the carrier's name, then the number. */
const TRACKING_NUMBER = /追蹤編號\s*[:：]\s*([A-Za-z0-9-]{1,100})$/;

/**
 * A Shopify shipping notice (Rotten Blues): "訂單 #3003 的貨件配送中".
 *
 * Shipped once its heading says the order is on its way; the tracking
 * number comes with it when the shop entered one. The parcel's lines ("本次
 * 運送的商品") are not read: a notice moves an order, it never edits one. A
 * shop can ship an order in parts, and the first part's notice then marks
 * it all shipped — no sampled order has more than one record (tracker.md
 * §9.5).
 *
 * @param lines - the email's text lines (emailLines)
 */
export const readShopifyShipping = (lines: string[]): NoticeRead => {
  const orderNumber = lines.map((line) => ORDER_NUMBER.exec(line)?.[1]).find(Boolean);
  if (!orderNumber) return { ok: false, reason: 'no order number found' };
  if (!lines.includes(ON_ITS_WAY)) return { ok: false, reason: 'no shipping status found' };

  const trackingNumber = lines.map((line) => TRACKING_NUMBER.exec(line)?.[1]).find(Boolean) ?? null;

  return { ok: true, notice: { kind: 'shipped', orderNumber, trackingNumber } };
};
