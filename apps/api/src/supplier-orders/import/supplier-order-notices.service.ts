import { Injectable } from '@nestjs/common';
import { canChangeSupplierOrderStatus } from '@vinyl-order/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { fromDay } from '../supplier-order.mapper';
import type { ParsedNotice } from './notice';

/** What a notice did to its order (tracker.md §9.5). */
export type NoticeOutcome = 'updated' | 'unchanged' | 'not_yet';

/**
 * Applies a shop's payment or shipping notice to the order it names.
 *
 * A notice only moves an order forward; it never records or edits one, and
 * never undoes what the user marked by hand. So every write is conditional,
 * on the value it fills being empty or the status being the one checked,
 * and a write that matches nothing is "unchanged", not an error: the order
 * was already there, a repeat came, or a hand-made change got in first.
 * Notices are not refused for that — the script would only send them again.
 */
@Injectable()
export class SupplierOrderNoticesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param userId - whose import token sent it; the order must be theirs
   * @param notice - as parseNotice read it
   */
  async apply(userId: string, notice: ParsedNotice): Promise<NoticeOutcome> {
    // The natural key a confirmation is recorded under, so a notice finds
    // the order whether it was imported or typed in.
    const where = { userId, supplier: notice.supplier, orderNumber: notice.orderNumber };
    return notice.kind === 'paid'
      ? this.markPaid(where, notice.paidAt)
      : this.markShipped(where, notice.trackingNumber);
  }

  /**
   * Fill the payment day if it is empty. A day set by hand is kept, and the
   * status isn't touched: payment isn't a status (tracker.md §9.1). Written
   * on a cancelled order too — having paid is a fact; a refund is followed
   * by hand.
   */
  private async markPaid(where: OrderKey, paidAt: string): Promise<NoticeOutcome> {
    const { count } = await this.prisma.supplierOrder.updateMany({
      where: { ...where, paidAt: null },
      data: { paidAt: fromDay(paidAt) },
    });
    if (count > 0) return 'updated';
    return (await this.exists(where)) ? 'unchanged' : 'not_yet';
  }

  /**
   * Move the order to shipped if that is a move forward, and fill its
   * tracking number if it is empty.
   *
   * The status write is the compare-and-set of a hand-made change (§9.1): it
   * matches only while the order still has the status it was checked
   * against, so a move made in between wins and this one becomes unchanged.
   * One transaction, so the two land together. A cancelled order gets
   * neither: it won't arrive, and a number on it would only mislead.
   */
  private async markShipped(
    where: OrderKey,
    trackingNumber: string | null,
  ): Promise<NoticeOutcome> {
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.supplierOrder.findFirst({
        where,
        select: { id: true, status: true },
      });
      if (!order) return 'not_yet';
      if (order.status === 'cancelled') return 'unchanged';

      let changed = false;
      if (canChangeSupplierOrderStatus(order.status, 'shipped')) {
        const moved = await transaction.supplierOrder.updateMany({
          where: { id: order.id, status: order.status },
          data: { status: 'shipped' },
        });
        changed = moved.count > 0;
      }
      if (trackingNumber) {
        const filled = await transaction.supplierOrder.updateMany({
          where: { id: order.id, trackingNumber: null, status: { not: 'cancelled' } },
          data: { trackingNumber },
        });
        changed = changed || filled.count > 0;
      }
      return changed ? 'updated' : 'unchanged';
    });
  }

  private async exists(where: OrderKey): Promise<boolean> {
    return (await this.prisma.supplierOrder.count({ where })) > 0;
  }
}

/** An order by its natural key: whose, at which shop, which number. */
interface OrderKey {
  userId: string;
  supplier: ParsedNotice['supplier'];
  orderNumber: string;
}
