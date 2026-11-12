import type { StatedLine } from '../confirmation';
import { toCents, unitPriceCents } from '../money';

/** "Title × 2": a line's start. */
const ITEM = /^(.+?)\s*×\s*(\d+)$/;

/**
 * The lines of an order, from the part of the email that lists them.
 *
 * Both platforms write a line as its title and quantity ("… × 1"), then any
 * variant lines ("預購, LP"), then the line's total. A variant is kept after a
 * slash in the title, since it can be the edition. The total is split back
 * into a price per copy.
 *
 * @param section - the email's lines between the list's heading and its subtotal
 * @param price - how this platform writes a line total; group 1 is the amount
 * @returns the lines, or why they couldn't be read
 */
export const readLineItems = (section: string[], price: RegExp): StatedLine[] | string => {
  const items: StatedLine[] = [];
  let index = 0;

  while (index < section.length) {
    const start = ITEM.exec(section[index]);
    if (!start) {
      index += 1;
      continue;
    }
    const quantity = Number(start[2]);
    const variants: string[] = [];
    index += 1;

    // Variant lines run until the line's price; another line's start first
    // means this one had none.
    let amount: RegExpExecArray | null = null;
    for (; index < section.length; index += 1) {
      amount = price.exec(section[index]);
      if (amount || ITEM.test(section[index])) break;
      variants.push(section[index]);
    }
    if (!amount) return 'a line has no price';
    index += 1;

    const lineTotal = toCents(amount[1]);
    if (lineTotal === null) return 'a line price is not an amount';
    if (quantity < 1) return 'a line has no quantity';
    const unit = unitPriceCents(lineTotal, quantity);
    if (unit === null) return "a line total doesn't divide by its quantity";

    items.push({
      title: [start[1], ...variants].join(' / '),
      quantity,
      unitPriceCents: unit,
    });
  }

  return items.length > 0 ? items : 'no lines found';
};

/**
 * Whether the lines, priced as read, add up to the email's own subtotal.
 *
 * The emails show one amount per line, and quantity 1 everywhere they were
 * sampled, so whether it is the line's total or its unit price can't be
 * seen. readLineItems takes it as the total. If a shop actually shows the
 * unit price, a line of 2 would come out at half price — plausible, and
 * wrong. Against the subtotal it doesn't add up, and the email is refused
 * instead (tracker.md §9.4). A line discount shown beside its price is
 * caught the same way.
 *
 * @param subtotalCents - the email's sum of its lines, before shipping and tax
 */
export const addsUpTo = (items: StatedLine[], subtotalCents: number): boolean =>
  items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0) === subtotalCents;

/**
 * The lines strictly between the first line equal to `from` and the first
 * after it equal to `to`, or null if either is missing.
 */
export const between = (lines: string[], from: string, to: string): string[] | null => {
  const start = lines.indexOf(from);
  if (start === -1) return null;
  const end = lines.indexOf(to, start + 1);
  return end === -1 ? null : lines.slice(start + 1, end);
};

/**
 * The amount on the line after a label ("總額:" then "TWD 940"), or null.
 *
 * @param amount - how this platform writes it; group 1 is the amount
 */
export const amountAfter = (lines: string[], label: string, amount: RegExp): number | null => {
  const at = lines.indexOf(label);
  if (at === -1 || at + 1 >= lines.length) return null;
  const match = amount.exec(lines[at + 1]);
  return match ? toCents(match[1]) : null;
};
