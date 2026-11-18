import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ConfirmationEmail } from '../src/supplier-orders/import/confirmation';
import { parseConfirmation } from '../src/supplier-orders/import/parse-confirmation';
import { parseNotice } from '../src/supplier-orders/import/parse-notice';

/**
 * Reading the shops' payment and shipping notices (docs/design/tracker.md
 * §9.5), THT's first.
 *
 * The fixtures are real emails with the recipient's name, pickup store, order
 * number, titles, images and tracking pixels replaced, and every link
 * removed — as the Apps Script sends them. Pure functions, no app: kept as an
 * e2e spec only because CI runs those.
 */

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures/emails', `${name}.html`), 'utf8');

const THT_PAYMENT: ConfirmationEmail = {
  from: 'THT唱片 <notifications+thtrecords@mail.easystore.co>',
  subject: '確認收款通知',
  date: '2026-11-04T07:40:21.000Z',
  html: fixture('tht-payment'),
};

const THT_SHIPPING: ConfirmationEmail = {
  from: 'THT唱片 <notifications+thtrecords@mail.easystore.co>',
  subject: '更新訂單出貨通知',
  date: '2026-10-31T09:56:23.000Z',
  html: fixture('tht-shipping'),
};

/** THT's payment notice with "支付日期" written as `written`. */
const paidOn = (written: string): ConfirmationEmail => ({
  ...THT_PAYMENT,
  html: THT_PAYMENT.html.replace('04/11/2026, 03:40 PM', written),
});

const reasonOf = (email: ConfirmationEmail): string => {
  const result = parseNotice(email);
  if (result.ok) throw new Error('Expected a refusal, got a notice');
  return result.reason;
};

describe('Email import: reading notices (e2e)', () => {
  describe('THT', () => {
    it('payment: the order number and the day it was paid', () => {
      expect(parseNotice(THT_PAYMENT)).toEqual({
        ok: true,
        notice: { kind: 'paid', supplier: 'tht', orderNumber: '1001', paidAt: '2026-11-04' },
      });
    });

    it('shipping: the order number, shipped', () => {
      expect(parseNotice(THT_SHIPPING)).toEqual({
        ok: true,
        notice: { kind: 'shipped', supplier: 'tht', orderNumber: '1001' },
      });
    });
  });

  describe('the payment day', () => {
    it('is read day first', () => {
      const result = parseNotice(paidOn('02/11/2026, 11:05 AM'));
      expect(result.ok && result.notice).toMatchObject({ paidAt: '2026-11-02' });
    });

    it('may be before the email: a transfer is confirmed later than it is made', () => {
      const result = parseNotice(paidOn('28/10/2026, 09:00 PM'));
      expect(result.ok && result.notice).toMatchObject({ paidAt: '2026-10-28' });
    });

    it("is refused when after the email's day", () => {
      expect(reasonOf(paidOn('05/11/2026, 03:40 PM'))).toBe('the payment day is after the email');
    });

    it('may be up to a month before the email', () => {
      const result = parseNotice(paidOn('04/10/2026, 03:40 PM'));
      expect(result.ok && result.notice).toMatchObject({ paidAt: '2026-10-04' });
    });

    it('is refused when over a month before: likely read the wrong way round', () => {
      // 4 November written month first, 11/04, reads day first as 11 April.
      expect(reasonOf(paidOn('11/04/2026, 03:40 PM'))).toBe(
        'the payment day is over a month before the email',
      );
    });

    it('is refused when no calendar has it', () => {
      expect(reasonOf(paidOn('31/02/2026, 03:40 PM'))).toBe('no payment day found');
    });

    it('is refused when missing', () => {
      expect(reasonOf({ ...THT_PAYMENT, html: THT_PAYMENT.html.replace('支付日期', '付款') })).toBe(
        'no payment day found',
      );
    });
  });

  describe('refusals', () => {
    it('a shipping status other than 已出貨', () => {
      const html = THT_SHIPPING.html.replace('已出貨', '已送達');
      expect(reasonOf({ ...THT_SHIPPING, html })).toBe('a shipping status this site does not read');
    });

    it('a shipping notice with no status', () => {
      const html = THT_SHIPPING.html.replace('物流狀態已更新', '狀態');
      expect(reasonOf({ ...THT_SHIPPING, html })).toBe('no shipping status found');
    });

    it('no order number', () => {
      expect(
        reasonOf({ ...THT_PAYMENT, html: THT_PAYMENT.html.replace('此訂單#1001', '此訂單') }),
      ).toBe('no order number found');
      expect(
        reasonOf({ ...THT_SHIPPING, html: THT_SHIPPING.html.replace('訂單 #1001', '訂單') }),
      ).toBe('no order number found');
    });

    it('a confirmation: it records an order, it is not a notice', () => {
      expect(reasonOf({ ...THT_PAYMENT, subject: '您的訂單已確認。' })).toBe(
        'not a notice this site reads',
      );
    });

    it("Cosmic's notices, until one is sampled", () => {
      const from = 'CM Music <notifications+universalvinylmusic@mail.easystore.co>';
      expect(reasonOf({ ...THT_PAYMENT, from })).toBe('not a notice this site reads');
    });

    it('an unknown sender', () => {
      expect(reasonOf({ ...THT_PAYMENT, from: 'THT <notifications@example.com>' })).toBe(
        'not a sender whose emails are read',
      );
    });

    it('an unreadable date', () => {
      expect(reasonOf({ ...THT_PAYMENT, date: 'yesterday' })).toBe('no date');
    });
  });

  it('a notice is never read as a confirmation', () => {
    for (const notice of [THT_PAYMENT, THT_SHIPPING]) {
      expect(parseConfirmation(notice)).toEqual({ ok: false, reason: 'not an order confirmation' });
    }
  });
});
