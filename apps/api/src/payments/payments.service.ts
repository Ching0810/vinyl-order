import { randomUUID } from 'node:crypto';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Order, PaymentResult, StartPaymentResponse } from '@vinyl-order/shared';

import type { Payment, Prisma } from '../generated/prisma/client';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { conflict } from '../orders/order.errors';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { violatesUniqueIndex } from '../prisma/unique-violation';
import { PaymentProvider, PaymentWebhookEvent } from './payment-provider';

/** Made in the one_pending_payment_per_order migration: one pending payment per order. */
const PENDING_PAYMENT_INDEX = 'Payment_orderId_pending_key';

/** PaymentEvent's primary key: an event id seen before means a redelivery. */
const PAYMENT_EVENT_KEY = 'PaymentEvent_pkey';

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
 * into orders only for what an order is: its errors, and its status
 * transitions.
 *
 * Starting a payment never changes the order's status. What the provider
 * reports does, through OrderLifecycleService — its webhook, or its answer
 * when a session is voided before the order is cancelled. Customer queries are scoped by
 * userId, as in OrdersService, so another customer's order is simply not
 * found.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly config: ConfigService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly orders: OrdersService,
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
   * Cancel one of the customer's orders — after making sure no money has been
   * taken for it.
   *
   * A pending order may have a payment the customer has already completed,
   * whose webhook is late or lost. So before cancelling, its session is voided
   * at the provider, which also says whether it was paid:
   * - not paid: the session can no longer be paid, the attempt is marked
   *   `failed`, and the order is cancelled;
   * - paid: the payment is settled from that answer, as a webhook would have
   *   settled it, so the order is now `paid` and cancelling it is a 409
   *   ORDER_NOT_PENDING carrying that status.
   *
   * The provider is asked outside any transaction, as when starting a payment.
   * If it can't be reached (502) nothing changes: without its answer, nobody
   * knows whether the order was paid. Expiry needs none of this — a session's
   * deadline is its order's.
   *
   * Everything else is OrdersService.cancel, unchanged: 404 for someone else's
   * order, 409 once it has left `pending`, stock returned exactly once.
   */
  async cancelOrder(userId: string, orderId: string): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status === 'pending') {
      const payment = await this.prisma.payment.findFirst({
        where: { orderId, status: 'pending' },
      });
      if (payment) {
        const session = await this.provider.expireSession(payment.providerSessionId);
        if (session.paid) {
          await this.prisma.$transaction((transaction) =>
            this.settleSucceeded(transaction, payment, session, 'void on cancel'),
          );
        } else {
          await this.prisma.payment.updateMany({
            where: { id: payment.id, status: 'pending' },
            data: { status: 'failed' },
          });
        }
      }
    }

    return this.orders.cancel(userId, orderId);
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

  /**
   * Act on a verified webhook: settle the payment it names, and pay the order
   * when it succeeded (docs/design/payments.md §8.1).
   *
   * One transaction, opened by recording the event id. A redelivery fails on
   * that key and changes nothing — including one arriving while the first is
   * still running, which waits on the key and then fails. Anything that goes
   * wrong after the record rolls it back too, so the provider's retry is
   * processed afresh rather than mistaken for a redelivery.
   *
   * Returns normally whenever retrying could not change the outcome — handled,
   * already handled, or about a session we don't know — so the provider stops
   * resending. Only a real failure (the database, say) throws, and the
   * provider's retry is then what we want.
   */
  async handleWebhook(event: PaymentWebhookEvent): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.paymentEvent.create({ data: { id: event.id, type: event.type } });

        const payment = await transaction.payment.findUnique({
          where: { providerSessionId: event.providerSessionId },
        });
        if (!payment) {
          // Not ours, or older than our records. A retry can't change that.
          this.logger.warn(`Webhook ${event.id} names unknown session ${event.providerSessionId}`);
          return;
        }

        if (event.type === 'payment.failed') {
          // Only a pending attempt can fail: a decline arriving after a success
          // for the same session must not undo it.
          await transaction.payment.updateMany({
            where: { id: payment.id, status: 'pending' },
            data: { status: 'failed' },
          });
          return;
        }

        await this.settleSucceeded(transaction, payment, event, `webhook ${event.id}`);
      });
    } catch (error) {
      if (violatesUniqueIndex(error, PAYMENT_EVENT_KEY)) return;
      throw error;
    }
  }

  /**
   * Accept a payment the provider reports as succeeded — by webhook, or in its
   * answer to voiding the session — and pay its order. Runs in the caller's
   * transaction, so the payment and the order change together.
   *
   * A wrong amount or currency is never accepted as payment for the order.
   * Otherwise the payment becomes `succeeded` — even over an earlier decline
   * for the session, since the money has been taken — through a conditional
   * update: when the webhook and a cancellation settle the same payment at
   * once, the row lock lets one of them do it, and the other finds it done and
   * stops, rather than reading "not pending" as an order that needs a refund.
   *
   * @param collected - what the provider says it took
   * @param source - where the report came from, for the log
   */
  private async settleSucceeded(
    transaction: Prisma.TransactionClient,
    payment: Payment,
    collected: { amountCents: number; currency: string },
    source: string,
  ): Promise<void> {
    if (collected.amountCents !== payment.amountCents || collected.currency !== payment.currency) {
      // Paid, but not what was asked. Loud, because someone has to look at
      // this money by hand.
      await transaction.payment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: { status: 'failed' },
      });
      this.logger.error(
        `${source}: payment ${payment.id} collected ${collected.amountCents} ${collected.currency}, ` +
          `expected ${payment.amountCents} ${payment.currency}; not accepted`,
      );
      return;
    }

    const { count } = await transaction.payment.updateMany({
      where: { id: payment.id, status: { not: 'succeeded' } },
      data: { status: 'succeeded' },
    });
    if (count === 0) return; // Already settled — by the other report, usually.

    if (!(await this.lifecycle.markPaid(transaction, payment.orderId))) {
      // Already paid by another attempt, or cancelled first — usually by the
      // expiry sweeper (§8.4). Money recorded against an order that isn't
      // waiting for it: to hand back.
      this.logger.warn(
        `Payment ${payment.id} succeeded but order ${payment.orderId} was no longer pending; refund it`,
      );
    }
  }

  /** The order's pending payment's page, if it has one. */
  private findPendingPayment(orderId: string): Promise<StartPaymentResponse | null> {
    return this.prisma.payment.findFirst({
      where: { orderId, status: 'pending' },
      select: { redirectUrl: true },
    });
  }
}
