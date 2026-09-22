import { Controller, Post, UseGuards } from '@nestjs/common';
import type { Order, PublicUser } from '@vinyl-order/shared';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
