import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ConfirmationEmail } from '../src/supplier-orders/import/confirmation';
import { parseConfirmation } from '../src/supplier-orders/import/parse-confirmation';
import { emailLines } from '../src/supplier-orders/import/email-text';
import { parseNotice } from '../src/supplier-orders/import/parse-notice';
import { readShopifyArrival } from '../src/supplier-orders/import/parsers/shopify-notices';

/**
 * Reading the shops' payment and shipping notices (docs/design/tracker.md
 * §9.5): THT's payment and shipping, Cosmic's payment, Rotten Blues' shipping
 * and arrival.
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

const RB_SHIPPING: ConfirmationEmail = {
  from: '爛調唱片 <store+100236001461@t.shopifyemail.com>',
  subject: '訂單 #3003 的貨件配送中',
  date: '2026-11-17T13:45:53.000Z',
  html: fixture('shopify-shipping'),
};

const COSMIC_PAYMENT: ConfirmationEmail = {
  from: 'CM Music <notifications+universalvinylmusic@mail.easystore.co>',
  subject: '確認收款通知',
  date: '2026-10-09T07:45:37.000Z',
  html: fixture('cosmic-payment'),
};

const RB_ARRIVAL: ConfirmationEmail = {
  from: '爛調唱片 <store+100236001461@t.shopifyemail.com>',
  subject: '訂單 #3003 的貨件已送達',
  date: '2026-10-03T23:32:02.000Z',
  html: fixture('shopify-arrival'),
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

    it('shipping: the order number, shipped, no tracking number', () => {
      expect(parseNotice(THT_SHIPPING)).toEqual({
        ok: true,
        notice: { kind: 'shipped', supplier: 'tht', orderNumber: '1001', trackingNumber: null },
      });
    });
  });

  describe('Cosmic', () => {
    it("payment: THT's template, read the same way", () => {
      expect(parseNotice(COSMIC_PAYMENT)).toEqual({
        ok: true,
        notice: { kind: 'paid', supplier: 'cosmic', orderNumber: '1001', paidAt: '2026-10-09' },
      });
    });

    it('payment: a day after the email is refused, as for THT', () => {
      const html = COSMIC_PAYMENT.html.replace('09/10/2026', '09/11/2026');
      expect(reasonOf({ ...COSMIC_PAYMENT, html })).toBe('the payment day is after the email');
    });

    it('shipping, until one is sampled', () => {
      expect(reasonOf({ ...COSMIC_PAYMENT, subject: '更新訂單出貨通知' })).toBe(
        'not a notice this site reads',
      );
    });
  });

  describe('Rotten Blues', () => {
    it('shipping: the order number, shipped, and the 7-11 tracking number', () => {
      expect(parseNotice(RB_SHIPPING)).toEqual({
        ok: true,
        notice: {
          kind: 'shipped',
          supplier: 'rotten_blues',
          orderNumber: '3003',
          trackingNumber: 'H00000000001',
        },
      });
    });

    it('shipping without a tracking number is still shipped', () => {
      const html = RB_SHIPPING.html.replace('H00000000001', '');
      const result = parseNotice({ ...RB_SHIPPING, html });
      expect(result.ok && result.notice).toMatchObject({ kind: 'shipped', trackingNumber: null });
    });

    it('is refused without the heading that says it is on its way', () => {
      const html = RB_SHIPPING.html.replaceAll('您的訂單配送中', '您的訂單');
      expect(reasonOf({ ...RB_SHIPPING, html })).toBe('no shipping status found');
    });

    it('arrival: the order number, ready for pickup, and the 7-11 tracking number', () => {
      expect(readShopifyArrival(emailLines(RB_ARRIVAL.html))).toEqual({
        ok: true,
        notice: { kind: 'ready_for_pickup', orderNumber: '3003', trackingNumber: 'H00000000002' },
      });
    });

    it('arrival is refused without the heading that says it arrived', () => {
      // A shipping notice is not an arrival, nor the reverse.
      expect(readShopifyArrival(emailLines(RB_SHIPPING.html))).toEqual({
        ok: false,
        reason: 'no shipping status found',
      });
      expect(parseNotice({ ...RB_SHIPPING, html: RB_ARRIVAL.html })).toEqual({
        ok: false,
        reason: 'no shipping status found',
      });
    });

    it('its confirmations are not notices, nor the reverse', () => {
      expect(reasonOf({ ...RB_SHIPPING, subject: '訂單 #3003 已確認' })).toBe(
        'not a notice this site reads',
      );
      expect(parseConfirmation(RB_SHIPPING)).toEqual({
        ok: false,
        reason: 'not an order confirmation',
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
    for (const notice of [THT_PAYMENT, THT_SHIPPING, COSMIC_PAYMENT, RB_ARRIVAL]) {
      expect(parseConfirmation(notice)).toEqual({ ok: false, reason: 'not an order confirmation' });
    }
  });
});
