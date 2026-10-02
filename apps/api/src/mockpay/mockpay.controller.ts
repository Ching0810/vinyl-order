import { Body, Controller, Get, Header, Param, Post, Redirect, UsePipes } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZodValidationPipe } from 'nestjs-zod';

import { CreateSessionDto, type CreateSessionResponse } from './dto/create-session.dto';
import { renderCheckoutPage } from './mockpay.page';
import { MockPaySessions } from './mockpay.sessions';

/** Where a settled session sends the browser. 303 so it follows with a GET. */
interface ReturnRedirect {
  url: string;
  statusCode: 303;
}

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

  /** GET /mockpay/checkout/:sessionId — the page the customer pays on. */
  @Get('checkout/:sessionId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  checkout(@Param('sessionId') sessionId: string): string {
    return renderCheckoutPage(this.sessions.find(sessionId));
  }

  /** POST /mockpay/checkout/:sessionId/pay — the customer pays. */
  @Post('checkout/:sessionId/pay')
  @Redirect()
  pay(@Param('sessionId') sessionId: string): ReturnRedirect {
    return this.returnTo(this.sessions.settle(sessionId, 'paid').returnUrl);
  }

  /** POST /mockpay/checkout/:sessionId/decline — the customer declines. */
  @Post('checkout/:sessionId/decline')
  @Redirect()
  decline(@Param('sessionId') sessionId: string): ReturnRedirect {
    return this.returnTo(this.sessions.settle(sessionId, 'declined').returnUrl);
  }

  /**
   * Back to the merchant. 303, not 302: the button was a POST, and 303 tells
   * the browser to follow with a GET rather than repeat it.
   */
  private returnTo(url: string): ReturnRedirect {
    return { url, statusCode: 303 };
  }
}
