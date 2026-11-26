import { Injectable } from '@nestjs/common';
import type { CancelReason } from '@vinyl-order/shared';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { byCatalogEntryId } from './stock-locks';

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
   * Move a pending order to `cancelled` and release its holds — exactly once.
   *
   * Of any number of concurrent cancellers (the customer, the expiry sweeper,
   * a second tab), only the one that still finds the order `pending` changes a
   * row, and only that one releases. Releasing unconditionally would free the
   * same copies twice.
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
   * Put a cancelled order's copies back on sale: its holds on the listings
   * released (tracker.md §8).
   *
   * Lines whose listing is gone are skipped: orders from before checkout sold
   * the catalogs, and listings the shop has taken down since — the sync
   * deleted the row, and its holds with it. Listings are locked in
   * checkout's order (see byCatalogEntryId), so a cancel and a checkout over
   * the same listings queue instead of deadlocking.
   */
  private async returnStock(transaction: Prisma.TransactionClient, orderId: string): Promise<void> {
    const items = await transaction.orderItem.findMany({
      where: { orderId },
      select: { catalogEntryId: true, quantity: true },
    });
    const lines = items
      .flatMap(({ catalogEntryId, quantity }) =>
        catalogEntryId ? [{ catalogEntryId, quantity }] : [],
      )
      .sort(byCatalogEntryId);

    for (const line of lines) {
      // updateMany, not update: a listing deleted since the read above is
      // skipped rather than failing the cancel.
      await transaction.catalogEntry.updateMany({
        where: { id: line.catalogEntryId },
        data: { reservedQty: { decrement: line.quantity } },
      });
    }
  }
}
