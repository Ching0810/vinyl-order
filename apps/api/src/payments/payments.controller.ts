import { Controller, Get, HttpStatus, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { PaymentResult, PublicUser, StartPaymentResponse } from '@vinyl-order/shared';
import type { Response } from 'express';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

/**
 * A customer paying for one of their orders.
 *
 * Shares the `orders` prefix with OrdersController: the URL reads as an action
 * on the order, while the code lives with the rest of payments. Guarded but not
 * role-restricted, and scoped by the authenticated user, as orders are.
 */
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * POST /orders/:id/payment — where to send the customer to pay.
   *
   * No request body: the amount is read from the order, never taken from the
   * client. Safe to repeat: while the order has a pending payment, its page is
   * returned instead of starting another. 201 when this started a payment, 200
   * when it returned the pending one — the status says whether anything was
   * created, as with checkout.
   */
  @Post(':id/payment')
  async start(
    @CurrentUser() user: PublicUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StartPaymentResponse> {
    const { payment, created } = await this.payments.start(user.id, id);

    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return payment;
  }

  /**
   * GET /orders/:id/payments/:paymentId — how one attempt stands.
   *
   * Polled by the page the provider sends the customer back to. Reaching that
   * page proves nothing, so it shows what this reports, which only the
   * provider's webhook changes.
   */
  @Get(':id/payments/:paymentId')
  findOne(
    @CurrentUser() user: PublicUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
  ): Promise<PaymentResult> {
    return this.payments.findOne(user.id, id, paymentId);
  }
}
