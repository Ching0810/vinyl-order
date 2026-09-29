import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { OrderLifecycleService } from './order-lifecycle.service';

/** Orders one sweep cancels at most. Anything left over waits for the next. */
const SWEEP_BATCH_SIZE = 100;

/**
 * Cancels pending orders nobody paid for before their deadline, and returns
 * their stock (docs/design/payments.md §8.3).
 *
 * Safe on any number of instances without coordination: two sweeps may pick
 * the same orders, but cancelOrder lets only one of them win each order. A
 * duplicate sweep wastes a few statements; it never returns stock twice.
 */
@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  /**
   * Only the trigger. The scheduler catches and logs anything it throws, and
   * is not loaded under test — tests call sweep() themselves.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireUnpaidOrders(): Promise<void> {
    const cancelled = await this.sweep();
    if (cancelled > 0) this.logger.log(`Expired ${cancelled} unpaid order(s)`);
  }

  /**
   * Cancel one batch of pending orders past their deadline, earliest first.
   *
   * @returns how many orders this sweep cancelled, not counting any that
   *   another canceller reached first
   */
  async sweep(): Promise<number> {
    // The shape of the [status, expiresAt] index, so this stays a range scan.
    const expired = await this.prisma.order.findMany({
      where: { status: 'pending', expiresAt: { lt: new Date() } },
      orderBy: { expiresAt: 'asc' },
      take: SWEEP_BATCH_SIZE,
      select: { id: true },
    });

    let cancelled = 0;
    // One at a time: a batch is small, and running them in parallel would hold
    // that many connections at once for nothing.
    for (const { id } of expired) {
      try {
        if (await this.lifecycle.cancelOrder({ id }, 'expired')) cancelled += 1;
      } catch (error) {
        // One failing order must not strand the rest of the batch. It is still
        // pending, so the next sweep tries it again.
        this.logger.error(`Could not expire order ${id}`, error);
      }
    }
    return cancelled;
  }
}
