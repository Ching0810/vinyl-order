import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZodValidationPipe } from 'nestjs-zod';

import { CreateSessionDto, type CreateSessionResponse } from './dto/create-session.dto';
import { MockPaySessions } from './mockpay.sessions';

/**
 * MockPay's HTTP surface, standing in for a payment provider's API.
 *
 * Unauthenticated, as a provider's hosted pages are; what keeps it out of
 * reach in production is that it is not mounted there at all (AppModule).
 */
@Controller('mockpay')
@UsePipes(ZodValidationPipe)
export class MockPayController {
  constructor(
    private readonly sessions: MockPaySessions,
    private readonly config: ConfigService,
  ) {}

  /** POST /mockpay/sessions — a merchant opens a session to collect money. */
  @Post('sessions')
  create(@Body() dto: CreateSessionDto): CreateSessionResponse {
    // JSON carries the deadline as a string; MockPay compares it as a Date.
    const session = this.sessions.create({ ...dto, expiresAt: new Date(dto.expiresAt) });

    return {
      sessionId: session.id,
      // Absolute: the merchant hands it to a browser, not back to us.
      checkoutUrl: new URL(
        `/mockpay/checkout/${session.id}`,
        this.config.getOrThrow<string>('PUBLIC_API_URL'),
      ).toString(),
    };
  }
}
