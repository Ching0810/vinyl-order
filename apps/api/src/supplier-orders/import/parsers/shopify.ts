import { parse } from 'node-html-parser';

import type { PlatformParse } from '../confirmation';
import { addsUpTo, amountAfter, between, readLineItems } from './line-items';

/**
 * The covers beside a Shopify order's lines, in line order: the template
 * marks them with a class of their own, apart from its spacer images.
 *
 * @param html - the email body
 */
export const shopifyCovers = (html: string): string[] =>
  parse(html)
    .querySelectorAll('img.order-list__product-image')
    .map((image) => image.getAttribute('src'))
    .filter((src): src is string => Boolean(src));

/** A line total: "$1,180.00". */
const LINE_AMOUNT = /^\$([\d,]+(?:\.\d{1,2})?)$/;

/** The total, which names its currency: "$1,240.00 TWD". */
const TOTAL_AMOUNT = /^\$([\d,]+(?:\.\d{1,2})?) TWD$/;

/** "訂單 #3003 已確認", and "訂單 #3003" as the email's heading. */
const ORDER_NUMBER = /訂單\s*#\s*([A-Za-z0-9-]+)/;

/**
 * A Shopify order confirmation (Rotten Blues): "訂單 #3003 已確認".
 *
 * The lines sit between "訂單摘要" and "小計" (the subtotal), and the total
 * follows "總計". Only a TWD total is read — a "$" alone could be any dollar.
 *
 * @param lines - the email's text lines (emailLines)
 * @param subject - the email's subject, which carries the order number
 */
export const parseShopify = (lines: string[], subject: string): PlatformParse => {
  const orderNumber =
    ORDER_NUMBER.exec(subject)?.[1] ??
    lines.map((line) => ORDER_NUMBER.exec(line)?.[1]).find(Boolean);
  if (!orderNumber) return { ok: false, reason: 'no order number found' };

  const section = between(lines, '訂單摘要', '小計');
  if (!section) return { ok: false, reason: 'no list of lines found' };
  const items = readLineItems(section, LINE_AMOUNT);
  if (typeof items === 'string') return { ok: false, reason: items };

  const subtotalCents = amountAfter(lines, '小計', LINE_AMOUNT);
  if (subtotalCents === null) return { ok: false, reason: 'no subtotal found' };
  if (!addsUpTo(items, subtotalCents)) {
    return { ok: false, reason: "the lines don't add up to the subtotal" };
  }

  const totalCents = amountAfter(lines, '總計', TOTAL_AMOUNT);
  if (totalCents === null) return { ok: false, reason: 'no total in TWD found' };

  // What was paid at checkout: the total when paid by card, $0.00 for cash
  // on pickup. Anything short of the total, or no such line, is unpaid.
  const paidCents = amountAfter(lines, '本日總付款金額', TOTAL_AMOUNT);

  return { ok: true, orderNumber, totalCents, paidInFull: paidCents === totalCents, lines: items };
};
