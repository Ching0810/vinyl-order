import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentResult, StartPaymentResponse } from '@vinyl-order/shared';

import { conflict } from '../orders/order.errors';
import { PrismaService } from '../prisma/prisma.service';
import { violatesUniqueIndex } from '../prisma/unique-violation';
import { PaymentProvider } from './payment-provider';

/** Made in the one_pending_payment_per_order migration: one pending payment per order. */
const PENDING_PAYMENT_INDEX = 'Payment_orderId_pending_key';

/** What starting a payment answered with, and whether it created a new payment. */
export interface StartPaymentResult {
  payment: StartPaymentResponse;
  /** False when the order already had a pending payment and this returned its page. */
  created: boolean;
}

/**
 * Paying for orders: the payments a customer starts, and in time what the
 * provider reports about them.
 *
 * Payments depend on orders, never the reverse — an order does not need to
 * know how it gets paid for. So this module owns the Payment table and reaches
 * into orders only for what an order is: its errors, and later its status
 * transitions.
 *
 * Starting a payment never changes the order's status — only the provider's
 * webhook does — so this does not go through OrderLifecycleService. Queries
 * are scoped by userId, as in OrdersService, so another customer's order is
 * simply not found.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly config: ConfigService,
  ) {}

  /**
   * Start a payment for a pending order, or return its pending payment's page.
   *
   * 404 for someone else's order. 409 ORDER_NOT_PENDING once it has left
   * `pending`, and ORDER_EXPIRED once its deadline has passed — checked before
   * a pending payment is reused, so an order that can no longer be paid never
   * gets its old page back.
   *
   * The lookup for a pending payment only saves a provider call. Two requests at
   * once both miss it, and the unique index on pending payments decides which
   * one's attempt is kept; the other answers with the winner's page. Its own
   * provider session is left unused, which is harmless: nobody is sent to it,
   * and it expires with the order.
   *
   * The provider is called outside any transaction, so no lock is held while
   * waiting on another service. An order cancelled during that call can end up
   * with a pending payment; its session expires with the order, and a payment
   * that still lands is the paid-after-cancelled case the webhook records
   * (docs/design/payments.md §8.4).
   */
  async start(userId: string, orderId: string): Promise<StartPaymentResult> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { status: true, expiresAt: true, subtotalCents: true, currency: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'pending') {
      throw conflict('ORDER_NOT_PENDING', 'This order can no longer be paid.', {
        status: order.status,
      });
    }
    // The deadline decides, not the sweeper: it runs once a minute, so an
    // expired order can still read `pending` for a while.
    if (order.expiresAt <= new Date()) {
      throw conflict('ORDER_EXPIRED', 'The time to pay for this order has run out.');
    }

    const existing = await this.findPendingPayment(orderId);
    if (existing) return { payment: existing, created: false };

    // Generated here rather than by the database: the return URL has to name
    // this attempt, and the provider needs that URL before the row can exist.
    const paymentId = randomUUID();
    const returnUrl = new URL(
      `/orders/${orderId}/payments/${paymentId}`,
      this.config.getOrThrow<string>('PUBLIC_WEB_URL'),
    ).toString();

    // Amount and currency come from the order, never from the request.
    const session = await this.provider.createSession({
      orderId,
      amountCents: order.subtotalCents,
      currency: order.currency,
      expiresAt: order.expiresAt,
      returnUrl,
    });

    try {
      await this.prisma.payment.create({
        data: {
          id: paymentId,
          orderId,
          providerSessionId: session.providerSessionId,
          amountCents: order.subtotalCents,
          currency: order.currency,
          redirectUrl: session.redirectUrl,
        },
      });
    } catch (error) {
      if (!violatesUniqueIndex(error, PENDING_PAYMENT_INDEX)) throw error;

      // Lost to a concurrent request. If its attempt has already been settled
      // too, there is no page to return; report the failure rather than
      // pretend, and the customer can press again.
      const winner = await this.findPendingPayment(orderId);
      if (!winner) throw error;
      return { payment: winner, created: false };
    }

    return { payment: { redirectUrl: session.redirectUrl }, created: true };
  }

  /**
   * One payment attempt's status, with its order's.
   *
   * 404 unless the payment belongs to this order and the order to this user —
   * all three in one query, so another customer's payment, or a payment id put
   * under the wrong order, is simply not found. 404 rather than 403, as in
   * OrdersService: a 403 would confirm the id exists.
   */
  async findOne(userId: string, orderId: string, paymentId: string): Promise<PaymentResult> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, orderId, order: { userId } },
      select: { id: true, status: true, order: { select: { id: true, status: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /** The order's pending payment's page, if it has one. */
  private findPendingPayment(orderId: string): Promise<StartPaymentResponse | null> {
    return this.prisma.payment.findFirst({
      where: { orderId, status: 'pending' },
      select: { redirectUrl: true },
    });
  }
}
