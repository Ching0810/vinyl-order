import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  IDEMPOTENCY_KEY_HEADER,
  idempotencyKeySchema,
  type Connection,
  type Order,
  type OrderSummary,
  type PublicUser,
} from '@vinyl-order/shared';
import type { Response } from 'express';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { toPageArgs } from '../common/pagination';
import { OrdersService } from './orders.service';

/**
 * Read the client's key for this checkout attempt, if it sent one.
 *
 * Keys are stored, so an over-long one is refused rather than truncated. The
 * format is otherwise the client's business: the server only compares keys.
 */
const readIdempotencyKey = (header?: string): string | undefined => {
  if (header === undefined) return undefined;

  const parsed = idempotencyKeySchema.safeParse(header);
  if (!parsed.success) {
    throw new BadRequestException(`${IDEMPOTENCY_KEY_HEADER} must be 1-200 characters.`);
  }
  return parsed.data;
};

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
   *
   * An optional Idempotency-Key header identifies one checkout attempt, so a
   * retry of that attempt answers 200 with the order the first request placed
   * instead of placing a second one. A fresh order answers 201: the status
   * says whether anything was created, which is what a retrying client wants
   * to know.
   */
  @Post()
  async checkout(
    @CurrentUser() user: PublicUser,
    @Res({ passthrough: true }) response: Response,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey?: string,
  ): Promise<Order> {
    const { order, created } = await this.orders.checkout(
      user.id,
      readIdempotencyKey(idempotencyKey),
    );

    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return order;
  }
}
