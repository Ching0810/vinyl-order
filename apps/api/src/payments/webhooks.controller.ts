import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { PaymentProvider, type WebhookHeaders } from './payment-provider';
import { PaymentsService } from './payments.service';

/**
 * Where the payment provider reports results (docs/design/payments.md §8.1).
 *
 * No login guard: the caller is the provider, not a customer, and what proves
 * it is the webhook's signature. No DTO either: the body must not be parsed,
 * let alone trusted, until that signature is checked over its raw bytes.
 */
@Controller('payments')
export class WebhooksController {
  constructor(
    private readonly provider: PaymentProvider,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * POST /payments/webhook — 200 once an event is handled or already was; 400
   * only for what a retry cannot fix, a bad signature or an unreadable body.
   * Providers resend anything else, so a redelivery answered with an error
   * would be resent forever.
   *
   * Not throttled: a provider can deliver in bursts, and a dropped webhook is
   * a payment we never hear about until it is resent.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: WebhookHeaders,
  ): Promise<{ received: true }> {
    if (!request.rawBody) {
      // The app was created without { rawBody: true }: no webhook can ever be
      // verified, which is a misconfiguration, not the provider's fault.
      throw new Error('Raw request body unavailable; create the app with { rawBody: true }');
    }

    const event = this.provider.verifyWebhook(request.rawBody, headers);
    await this.payments.handleWebhook(event);
    return { received: true };
  }
}
