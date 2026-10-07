import type { Server } from 'node:net';

import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { z } from 'zod';

import { CreateSessionInput, PaymentProvider, PaymentSession } from './payment-provider';

/**
 * How long to wait for MockPay. A provider that hangs must not hang the
 * customer's request with it; past this, the attempt fails as unreachable.
 */
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * MockPay's answer to opening a session, as it arrives over the wire.
 *
 * Written here rather than imported from MockPay: it stands in for a third
 * party, so this side knows only what comes back. Validated rather than cast,
 * like any input from outside — a malformed answer must fail here, not leave
 * an undefined session id in our database.
 */
const mockPaySessionSchema = z.object({
  sessionId: z.string().min(1),
  checkoutUrl: z.url(),
});

/** What the customer sees for any provider failure; the detail goes to the log. */
const providerUnavailable = () => new BadGatewayException('Payment provider unavailable');

/**
 * Our client for MockPay: turns our request into MockPay's, and its answer
 * into ours — the one place that knows MockPay's format.
 *
 * It talks to MockPay over HTTP only, exactly as a client for a real provider
 * would. Every failure — unreachable, too slow, an error status, an answer we
 * cannot read — is a 502: the customer can do nothing about it.
 */
@Injectable()
export class MockPayProvider extends PaymentProvider {
  private readonly logger = new Logger(MockPayProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly adapterHost: HttpAdapterHost,
  ) {
    super();
  }

  async createSession(input: CreateSessionInput): Promise<PaymentSession> {
    const url = `${this.baseUrl()}/sessions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Dates cross JSON as ISO strings.
        body: JSON.stringify({ ...input, expiresAt: input.expiresAt.toISOString() }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Connection refused, DNS failure, or the timeout above.
      this.logger.error(`MockPay unreachable at ${url}: ${String(error)}`);
      throw providerUnavailable();
    }

    if (!response.ok) {
      this.logger.error(`MockPay createSession failed: ${response.status} ${response.statusText}`);
      throw providerUnavailable();
    }

    const parsed = mockPaySessionSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      this.logger.error(`MockPay answered in an unexpected shape: ${parsed.error.message}`);
      throw providerUnavailable();
    }

    return { providerSessionId: parsed.data.sessionId, redirectUrl: parsed.data.checkoutUrl };
  }

  /**
   * MockPay's server-to-server address, without a trailing slash. MOCKPAY_URL
   * when set; otherwise this process, where MockPay is mounted. Read per call,
   * not at boot, because e2e suites listen on a random port.
   */
  private baseUrl(): string {
    const configured = this.config.get<string>('MOCKPAY_URL');
    if (configured) return configured.replace(/\/$/, '');

    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error(
        'MockPay address unknown: the API is not listening on a port. Set MOCKPAY_URL.',
      );
    }
    return `http://127.0.0.1:${address.port}/mockpay`;
  }
}
