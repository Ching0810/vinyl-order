import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Connection,
  Order as OrderContract,
  OrderSummary,
  PageArgs,
} from '@vinyl-order/shared';

import { paginate } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { conflict } from './order.errors';
import { toOrderContract, toOrderSummary, withItems, withLineCount } from './order.mapper';

/**
 * Newest first. id breaks ties between orders placed in the same millisecond,
 * which cursor paging needs to be deterministic.
 */
const orderHistoryOrder = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.OrderOrderByWithRelationInput[];

/**
 * A customer's view of their own orders: reading them back, and the actions a
 * customer may take on one.
 *
 * Every query is scoped by userId inside the query itself, so another
 * customer's order is simply not found — there is no separate ownership check
 * to forget.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  /**
   * The user's order history, newest first, cursor-paginated.
   *
   * A foreign or unknown cursor can't leak anything: `where` still limits the
   * page to this user's orders, and a cursor Prisma can't find gives an empty
   * page.
   */
  list(userId: string, args: PageArgs): Promise<Connection<OrderSummary>> {
    return paginate(
      args,
      (window) =>
        this.prisma.order.findMany({
          where: { userId },
          orderBy: orderHistoryOrder,
          include: withLineCount,
          ...window,
        }),
      toOrderSummary,
    );
  }

  /**
   * One of the user's orders with every line.
   *
   * 404 rather than 403 for someone else's order: a 403 would confirm that the
   * id exists.
   */
  async findOne(userId: string, id: string): Promise<OrderContract> {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: withItems,
    });
    if (!order) throw new NotFoundException('Order not found');
    return toOrderContract(order);
  }

  /**
   * Cancel one of the user's pending orders and return its stock.
   *
   * 404 for someone else's order, as in findOne. 409 ORDER_NOT_PENDING once
   * the order has left `pending`, carrying its current status.
   */
  async cancel(userId: string, id: string): Promise<OrderContract> {
    if (await this.lifecycle.cancelOrder({ id, userId }, 'customer')) {
      return this.findOne(userId, id);
    }

    // The update in cancelOrder already decided; this read only explains why
    // it changed nothing.
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    throw conflict('ORDER_NOT_PENDING', 'This order can no longer be cancelled.', {
      status: order.status,
    });
  }
}
