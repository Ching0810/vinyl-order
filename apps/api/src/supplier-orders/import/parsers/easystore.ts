import { parse } from 'node-html-parser';

import type { PlatformParse } from '../confirmation';
import { addsUpTo, amountAfter, between, readLineItems } from './line-items';

/** `background-image: url('…')`, quoted or not. */
const BACKGROUND_URL = /background-image:\s*url\(\s*(['"]?)(.*?)\1\s*\)/i;

/**
 * The covers beside an EasyStore order's lines, in line order.
 *
 * They are CSS backgrounds in the order's own table — the one whose rows
 * read "… × 1". Not every image in the email: the `<img>` at the top is the
 * shop's logo, and Cosmic's "為您推薦產品" are backgrounds too, in a table of
 * their own.
 *
 * @param html - the email body
 */
export const easyStoreCovers = (html: string): string[] => {
  const orderTable = parse(html)
    .querySelectorAll('table')
    .find((table) => table.text.includes('×'));
  if (!orderTable) return [];
  return orderTable
    .querySelectorAll('[style]')
    .map((element) => BACKGROUND_URL.exec(element.getAttribute('style') ?? '')?.[2])
    .filter((url): url is string => Boolean(url));
};

/** "TWD 880", "TWD 2,199". */
const AMOUNT = /^TWD ([\d,]+(?:\.\d{1,2})?)$/;

/** "您已經成功下訂單#1001，…". */
const ORDER_NUMBER = /下訂單\s*#\s*([A-Za-z0-9-]+)/;

/**
 * An EasyStore order confirmation (THT, Cosmic): "您的訂單已確認。".
 *
 * The lines sit between "訂單詳情" and "金額:" (the subtotal), and the total
 * follows "總額:", shipping, tax and points already in. Nothing after the
 * total is read: Cosmic goes on to "為您推薦產品", other records with prices
 * that must not become lines.
 *
 * @param lines - the email's text lines (emailLines)
 */
export const parseEasyStore = (lines: string[]): PlatformParse => {
  const orderNumber = lines.map((line) => ORDER_NUMBER.exec(line)?.[1]).find(Boolean);
  if (!orderNumber) return { ok: false, reason: 'no order number found' };

  const section = between(lines, '訂單詳情', '金額:');
  if (!section) return { ok: false, reason: 'no list of lines found' };
  const items = readLineItems(section, AMOUNT);
  if (typeof items === 'string') return { ok: false, reason: items };

  const subtotalCents = amountAfter(lines, '金額:', AMOUNT);
  if (subtotalCents === null) return { ok: false, reason: 'no subtotal found' };
  if (!addsUpTo(items, subtotalCents)) {
    return { ok: false, reason: "the lines don't add up to the subtotal" };
  }

  const totalCents = amountAfter(lines, '總額:', AMOUNT);
  if (totalCents === null) return { ok: false, reason: 'no total found' };

  // The confirmation says nothing about payment; the shop's 確認收款通知 does
  // (tracker.md §9.5), so until that is read the order starts unpaid.
  return { ok: true, orderNumber, totalCents, paidInFull: false, lines: items };
};
