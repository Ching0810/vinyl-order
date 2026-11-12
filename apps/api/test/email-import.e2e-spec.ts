import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ConfirmationEmail } from '../src/supplier-orders/import/confirmation';
import { emailLines } from '../src/supplier-orders/import/email-text';
import { expectedMonthFromTitle } from '../src/supplier-orders/import/expected-month';
import { toCents, unitPriceCents } from '../src/supplier-orders/import/money';
import { parseConfirmation } from '../src/supplier-orders/import/parse-confirmation';

/**
 * Reading the shops' order confirmations (docs/design/tracker.md §9.4).
 *
 * The fixtures are real emails with the recipient's name, addresses, pickup
 * store, order numbers and every link replaced or removed — as the Apps
 * Script sends them, links stripped. Pure functions, no app: kept as an e2e
 * spec only because CI runs those.
 */

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures/emails', `${name}-confirmation.html`), 'utf8');

const THT: ConfirmationEmail = {
  from: 'THT唱片 <notifications+thtrecords@mail.easystore.co>',
  subject: '您的訂單已確認。',
  date: '2026-11-04T07:39:50.000Z',
  html: fixture('tht'),
};

const COSMIC: ConfirmationEmail = {
  from: 'CM Music <notifications+universalvinylmusic@mail.easystore.co>',
  subject: '您的訂單已確認。',
  date: '2026-10-09T07:45:19.000Z',
  html: fixture('cosmic'),
};

const ROTTEN_BLUES: ConfirmationEmail = {
  from: '爛調唱片 <store+100236001461@t.shopifyemail.com>',
  subject: '訂單 #3003 已確認',
  date: '2026-10-05T08:28:51.000Z',
  html: fixture('shopify'),
};

/** The order a successful parse gives, failing the test otherwise. */
const orderOf = (email: ConfirmationEmail) => {
  const result = parseConfirmation(email);
  if (!result.ok) throw new Error(`Expected an order, got: ${result.reason}`);
  return result.order;
};

/** THT's email with its subtotal ("金額:") changed, the line prices left alone. */
const withThtSubtotal = (html: string, amount: string): string =>
  html.replace(/(金額:<\/span><\/td>\s*<td[^>]*><strong>)TWD 880/, `$1TWD ${amount}`);

const reasonOf = (email: ConfirmationEmail): string => {
  const result = parseConfirmation(email);
  if (result.ok) throw new Error('Expected a refusal, got an order');
  return result.reason;
};

describe('Email import: reading confirmations (e2e)', () => {
  describe('each shop', () => {
    it('THT: number, total with shipping, a month from the title, the cover beside the line', () => {
      expect(orderOf(THT)).toEqual({
        supplier: 'tht',
        orderNumber: '1001',
        orderedAt: '2026-11-04',
        totalCents: 94_000,
        paidAt: null,
        items: [
          {
            title: 'Test Artist - Sample Album LP (12月補貨預訂)',
            quantity: 1,
            unitPriceCents: 88_000,
            expectedMonth: '2026-12',
            // The line's own thumbnail — not the shop logo at the top.
            imageUrl: 'https://cdn.store-assets.com/s/270153/i/10000001.jpg',
          },
        ],
      });
    });

    // Cosmic's email goes on after the total with "為您推薦產品": four other
    // records with prices and pictures, none of them bought.
    it('Cosmic: the variant kept, and nothing after the total read as a line', () => {
      expect(orderOf(COSMIC)).toEqual({
        supplier: 'cosmic',
        orderNumber: '2002',
        orderedAt: '2026-10-09',
        totalCents: 55_000,
        paidAt: null,
        items: [
          {
            title: 'Test Band - Calendar 2027 【壁掛式年曆】（官方周邊） / 預購, LP',
            quantity: 1,
            unitPriceCents: 45_700,
            expectedMonth: null,
            imageUrl: 'https://cdn.store-assets.com/s/971474/i/10000002.jpeg',
          },
        ],
      });
    });

    it('Rotten Blues: number from the subject, dollars with cents, the TWD total', () => {
      expect(orderOf(ROTTEN_BLUES)).toEqual({
        supplier: 'rotten_blues',
        orderNumber: '3003',
        orderedAt: '2026-10-05',
        totalCents: 124_000,
        paidAt: null,
        items: [
          {
            title:
              '【黑膠】Test Band《Sample Record (20th Anniversary Edition)》20週年紀念版 灰色彩膠',
            quantity: 1,
            unitPriceCents: 118_000,
            expectedMonth: null,
            imageUrl:
              'https://cdn.shopify.com/s/files/1/1002/3600/1461/files/0000000000000-001_compact_cropped.jpg?v=1',
          },
        ],
      });
    });
  });

  describe('the order', () => {
    // 2026-11-03 16:30 UTC is already the 4th in Taipei.
    it("is dated by the email's day in Taipei, not in UTC", () => {
      expect(orderOf({ ...THT, date: '2026-11-03T16:30:00.000Z' }).orderedAt).toBe('2026-11-04');
    });

    // The fixture is cash on pickup: $0.00 paid at checkout, so unpaid (as
    // above). Paid by card, the whole total shows there instead.
    it('is paid on its day when Shopify says the whole total was paid', () => {
      const html = ROTTEN_BLUES.html.replace('$0.00 TWD', '$1,240.00 TWD');

      expect(orderOf({ ...ROTTEN_BLUES, html }).paidAt).toBe('2026-10-05');
    });

    it('is unpaid when only part of the total was paid', () => {
      const html = ROTTEN_BLUES.html.replace('$0.00 TWD', '$100.00 TWD');

      expect(orderOf({ ...ROTTEN_BLUES, html }).paidAt).toBeNull();
    });

    it('recognises the sender whatever the display name and case', () => {
      expect(orderOf({ ...THT, from: 'NOTIFICATIONS+THTRECORDS@MAIL.EASYSTORE.CO' }).supplier).toBe(
        'tht',
      );
    });
  });

  describe('covers', () => {
    it('are dropped from a host the shops do not use', () => {
      const html = THT.html.replace(
        'https://cdn.store-assets.com/s/270153/i/10000001.jpg',
        'https://tracker.example/cover.jpg',
      );

      expect(orderOf({ ...THT, html }).items[0].imageUrl).toBeNull();
    });

    // Two lines, one picture: pairing by position would give one record
    // another's cover, so neither gets one.
    it('are left out when there is not one per line', () => {
      const html = withThtSubtotal(
        THT.html.replace(
          '(12月補貨預訂)&nbsp;×&nbsp;1</div>',
          '(12月補貨預訂)&nbsp;×&nbsp;1</div><div>TWD 880</div><div>Second × 1</div>',
        ),
        '1,760',
      );

      const { items } = orderOf({ ...THT, html });

      expect(items).toHaveLength(2);
      expect(items.map(({ imageUrl }) => imageUrl)).toEqual([null, null]);
    });
  });

  // Anything not clearly a confirmation it can read is refused with a reason
  // — and the reason never quotes the email.
  describe('refusals', () => {
    it('an unknown sender', () => {
      expect(reasonOf({ ...THT, from: 'Someone <orders@elsewhere.example>' })).toBe(
        'not a sender whose emails are read',
      );
    });

    it('a shipping notice from the same sender', () => {
      expect(reasonOf({ ...THT, subject: '更新訂單出貨通知' })).toBe('not an order confirmation');
    });

    it('an unreadable date', () => {
      expect(reasonOf({ ...THT, date: 'yesterday' })).toBe('no date');
    });

    it('no order number', () => {
      expect(reasonOf({ ...THT, html: THT.html.replace('#1001', '') })).toBe(
        'no order number found',
      );
    });

    it('no total', () => {
      expect(reasonOf({ ...THT, html: THT.html.replace('總額:', '總計:') })).toBe('no total found');
    });

    it('a total not in TWD', () => {
      const html = ROTTEN_BLUES.html.replace('$1,240.00 TWD', '$40.00 USD');

      expect(reasonOf({ ...ROTTEN_BLUES, html })).toBe('no total in TWD found');
    });

    // The samples all have quantity 1, so whether a line's amount is its
    // total or its unit price is unseen. Were it the unit price, two copies
    // at 880 would read as 440 each — and the subtotal of 1,760 gives it away.
    it("lines that don't add up to the subtotal", () => {
      const html = withThtSubtotal(THT.html.replace('&nbsp;×&nbsp;1', '&nbsp;×&nbsp;2'), '1,760');

      expect(reasonOf({ ...THT, html })).toBe("the lines don't add up to the subtotal");
    });

    it('the same, read as line totals, when they do add up', () => {
      const html = THT.html.replace('&nbsp;×&nbsp;1', '&nbsp;×&nbsp;2');

      expect(orderOf({ ...THT, html }).items[0]).toMatchObject({
        quantity: 2,
        unitPriceCents: 44_000,
      });
    });

    it("a line total that doesn't divide by its quantity", () => {
      const html = THT.html.replace('&nbsp;×&nbsp;1', '&nbsp;×&nbsp;3');

      expect(reasonOf({ ...THT, html })).toBe("a line total doesn't divide by its quantity");
    });
  });
});

describe('Email import: the pieces (e2e)', () => {
  describe('emailLines', () => {
    it('gives one line per block or cell, whitespace collapsed, hidden text dropped', () => {
      const html =
        '<!DOCTYPE html><html><head><style>p{}</style></head><body>' +
        '<p>Hello&nbsp;&nbsp; there</p><table><tr><td>金額:</td><td>TWD 880</td></tr></table>' +
        '<script>ignored()</script></body></html>';

      expect(emailLines(html)).toEqual(['Hello there', '金額:', 'TWD 880']);
    });
  });

  describe('toCents', () => {
    it.each([
      ['880', 88_000],
      ['2,199', 219_900],
      ['1,180.00', 118_000],
      ['2.86', 286],
      ['0.5', 50],
    ])('%s → %d', (text, cents) => {
      expect(toCents(text)).toBe(cents);
    });

    it.each(['', 'TWD', '1,2345', '12.345', '-5'])('refuses %p', (text) => {
      expect(toCents(text)).toBeNull();
    });
  });

  it('splits a line total only when it divides evenly', () => {
    expect(unitPriceCents(176_000, 2)).toBe(88_000);
    expect(unitPriceCents(100, 3)).toBeNull();
  });

  describe('expectedMonthFromTitle', () => {
    it.each([
      ['a month still ahead this year', 'X (12月補貨預訂)', '2026-11-04', '2026-12'],
      ['the order month itself', 'X (11月預購)', '2026-11-04', '2026-11'],
      ['a month already passed: next year', 'X (1月發行預訂)', '2026-11-04', '2027-01'],
      ['a month/day, mixed-width brackets', 'X (10/23發行預訂）', '2026-10-01', '2026-10'],
      ['full-width brackets', 'X （3月出貨）', '2026-11-04', '2027-03'],
    ])('%s', (_, title, orderedAt, month) => {
      expect(expectedMonthFromTitle(title, orderedAt)).toBe(month);
    });

    it.each([
      ['no note', 'Test Artist - Sample Album LP'],
      ['a note that is not a date', 'Greatest Hits (2015-2025)'],
      ['a month that does not exist', 'X (13月預購)'],
      ['a variant note', 'Test Band 【壁掛式年曆】（官方周邊）'],
    ])('none for %s', (_, title) => {
      expect(expectedMonthFromTitle(title, '2026-11-04')).toBeNull();
    });
  });
});
