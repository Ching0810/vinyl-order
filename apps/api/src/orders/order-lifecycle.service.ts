import { Injectable } from '@nestjs/common';
import type { CancelReason } from '@vinyl-order/shared';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { byProductId } from './stock-locks';

/**
 * Moves an order from one status to the next (docs/design/payments.md §4).
 *
 * Every entry point that changes an order's status — the customer, the expiry
 * sweeper, and later the payment webhook and the admin — goes through here, so
 * each transition's rule is written once. Nothing here knows about HTTP or who
 * is asking: callers scope the order and translate the result.
 *
 * Every transition is a conditional update on the status it leaves, never a
 * read followed by a write. Of any number of concurrent callers, only the one
 * that still finds the expected status changes a row.
 */
@Injectable()
export class OrderLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Move a pending order to `cancelled` and return its stock — exactly once.
   *
   * Of any number of concurrent cancellers (the customer, the expiry sweeper,
   * a second tab), only the one that still finds the order `pending` changes a
   * row, and only that one restocks. Restocking unconditionally would return
   * the same copies twice.
   *
   * @param order - the order to cancel, scoped to its owner when a customer acts
   * @param reason - who ended it: the customer, or the payment deadline
   * @returns whether this call cancelled the order
   */
  async cancelOrder(
    order: { id: string; userId?: string },
    reason: CancelReason,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const { count } = await transaction.order.updateMany({
        where: { ...order, status: 'pending' },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason },
      });
      if (count === 0) return false;

      await this.returnStock(transaction, order.id);
      return true;
    });
  }

  /**
   * Move a pending order to `paid` — exactly once.
   *
   * Runs in the caller's transaction rather than its own: the payment webhook
   * settles the payment and the order together, so either both change or
   * neither does. When payment and expiry reach the same order at once, both
   * conditional updates wait on the row lock and only one finds it `pending`.
   *
   * @param transaction - the caller's, so this commits or rolls back with it
   * @returns whether this call paid the order; false means it had already left
   *   `pending` — paid by an earlier event, or cancelled first
   */
  async markPaid(transaction: Prisma.TransactionClient, orderId: string): Promise<boolean> {
    const { count } = await transaction.order.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'paid', paidAt: new Date() },
    });
    return count === 1;
  }

  /**
   * Put a cancelled order's copies back on sale.
   *
   * Lines whose product has since been deleted are skipped: there is nothing
   * to put them back on. Products are locked in checkout's order (see
   * byProductId), so a cancel and a checkout over the same records queue
   * instead of deadlocking.
   */
  private async returnStock(transaction: Prisma.TransactionClient, orderId: string): Promise<void> {
    const items = await transaction.orderItem.findMany({
      where: { orderId },
      select: { productId: true, quantity: true },
    });
    const lines = items
      .flatMap(({ productId, quantity }) => (productId ? [{ productId, quantity }] : []))
      .sort(byProductId);

    for (const line of lines) {
      // updateMany, not update: a product deleted since the read above is
      // skipped rather than failing the cancel.
      await transaction.product.updateMany({
        where: { id: line.productId },
        data: { stock: { increment: line.quantity } },
      });
    }
  }
}
