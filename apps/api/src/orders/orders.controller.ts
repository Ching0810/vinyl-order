import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Connection, Order, OrderSummary, PublicUser } from '@vinyl-order/shared';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { toPageArgs } from '../common/pagination';
import { OrdersService } from './orders.service';

/**
 * The signed-in customer's orders.
 *
 * Guarded but not role-restricted, and scoped by the authenticated user rather
 * than a path parameter — same rule as the cart, so there is no identifier to
 * tamper with.
 */
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * GET /orders — order history, newest first. Forward: `?first=&after=`;
   * backward: `?last=&before=`. Defaults to the first 10.
   */
  @Get()
  list(
    @CurrentUser() user: PublicUser,
    @Query('first') first?: string,
    @Query('after') after?: string,
    @Query('last') last?: string,
    @Query('before') before?: string,
  ): Promise<Connection<OrderSummary>> {
    return this.orders.list(user.id, toPageArgs({ first, after, last, before }));
  }

  /** GET /orders/:id — one order with every line; 404 unless it is the user's. */
  @Get(':id')
  findOne(@CurrentUser() user: PublicUser, @Param('id') id: string): Promise<Order> {
    return this.orders.findOne(user.id, id);
  }

  /**
   * Place the current cart as an order.
   *
   * No request body, and so no DTO or validation pipe: the server reads the
   * cart itself. If the client sent the lines, the server would have to
   * re-validate every one against the database anyway, and the cart the
   * customer saw could disagree with the order created.
   */
  @Post()
  checkout(@CurrentUser() user: PublicUser): Promise<Order> {
    return this.orders.checkout(user.id);
  }
}
