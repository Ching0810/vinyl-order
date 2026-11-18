import type { NoticeRead } from '../notice';

/** The email's heading: "訂單 #3003", alone on its line. */
const ORDER_NUMBER = /^訂單\s*#\s*([A-Za-z0-9-]+)$/;

/** "7-11 追蹤編號: H00000000001": the carrier's name, then the number. */
const TRACKING_NUMBER = /追蹤編號\s*[:：]\s*([A-Za-z0-9-]{1,100})$/;

/**
 * A Shopify parcel notice: its heading says what happened to the parcel, and
 * the order number and tracking number sit where every one of them puts
 * them. The parcel's lines ("本次運送的商品") are not read: a notice moves an
 * order, it never edits one.
 */
const readParcel = (
  lines: string[],
  heading: string,
  kind: 'shipped' | 'ready_for_pickup',
): NoticeRead => {
  const orderNumber = lines.map((line) => ORDER_NUMBER.exec(line)?.[1]).find(Boolean);
  if (!orderNumber) return { ok: false, reason: 'no order number found' };
  if (!lines.includes(heading)) return { ok: false, reason: 'no shipping status found' };

  const trackingNumber = lines.map((line) => TRACKING_NUMBER.exec(line)?.[1]).find(Boolean) ?? null;

  return { ok: true, notice: { kind, orderNumber, trackingNumber } };
};

/**
 * A Shopify shipping notice (Rotten Blues): "訂單 #3003 的貨件配送中".
 *
 * Shipped once its heading says the order is on its way; the tracking
 * number comes with it when the shop entered one. A shop can ship an order
 * in parts, and the first part's notice then marks it all shipped — no
 * sampled order has more than one record (tracker.md §9.5).
 *
 * @param lines - the email's text lines (emailLines)
 */
export const readShopifyShipping = (lines: string[]): NoticeRead =>
  readParcel(lines, '您的訂單配送中', 'shipped');

/**
 * A Shopify arrival notice (Rotten Blues): "訂單 #3003 的貨件已送達".
 *
 * "已送達" is the parcel reaching the store, sent before it is collected, so
 * it means ready for pickup, not delivered (tracker.md §9.5). It carries the
 * tracking number too, and may be the first notice read for the parcel.
 *
 * @param lines - the email's text lines (emailLines)
 */
export const readShopifyArrival = (lines: string[]): NoticeRead =>
  readParcel(lines, '您的訂單已送達', 'ready_for_pickup');
