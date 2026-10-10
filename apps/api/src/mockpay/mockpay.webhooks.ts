import { createHmac, randomUUID } from 'node:crypto';
import type { Server } from 'node:net';

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';

import type { MockPaySession } from './mockpay.sessions';

/**
 * How long to wait before each retry, after the first attempt. Its length is
 * the number of retries: three attempts in all. A real provider keeps trying
 * for days; a stand-in only needs to show that it retries at all.
 */
const RETRY_DELAYS_MS = [500, 2_000];

/** A merchant that hangs counts as a failed attempt, retried like any other. */
const DELIVERY_TIMEOUT_MS = 5_000;

/** MockPay's webhook body — its own format, which the merchant's client parses. */
interface MockPayWebhook {
  /** The same on every retry of one event: what the merchant deduplicates by. */
  id: string;
  type: 'payment.succeeded' | 'payment.failed';
  createdAt: string;
  data: { sessionId: string; orderId: string; amountCents: number; currency: string };
}

/**
 * MockPay telling the merchant how each session ended, as a real provider
 * does: separately from the customer's redirect, signed, and at least once.
 *
 * Signed with HMAC-SHA256 over `<t>.<body>` under the shared secret. That is
 * written here rather than shared with the merchant's verifying code: the two
 * sides of a provider integration never share code, only the scheme.
 */
@Injectable()
export class MockPayWebhooks implements OnModuleDestroy {
  private readonly logger = new Logger(MockPayWebhooks.name);
  /** Deliveries waiting to run, and requests under way — so shutdown can stop both. */
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly inFlight = new Set<AbortController>();
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  /**
   * Announce how a settled session ended, after its delay. Returns at once:
   * the customer's redirect never waits for the webhook, so either can reach
   * the merchant first.
   */
  schedule(session: MockPaySession): void {
    if (session.outcome === 'open') throw new Error(`Session ${session.id} has not ended`);

    const event: MockPayWebhook = {
      id: `mpe_${randomUUID()}`,
      type: session.outcome === 'paid' ? 'payment.succeeded' : 'payment.failed',
      createdAt: new Date().toISOString(),
      data: {
        sessionId: session.id,
        orderId: session.orderId,
        amountCents: session.amountCents,
        currency: session.currency,
      },
    };
    // Serialised once, so every attempt sends the same bytes.
    const body = JSON.stringify(event);
    this.later(session.webhookDelayMs, () => this.deliver(body, event.id, 1));
  }

  /** Stop retrying and abandon requests under way, so nothing outlives the app. */
  onModuleDestroy(): void {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    for (const controller of this.inFlight) controller.abort();
  }

  private later(delayMs: number, task: () => Promise<void>): void {
    if (this.stopped) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void task();
    }, delayMs);
    this.timers.add(timer);
  }

  /**
   * One attempt. Anything but a 2xx — an error status, no answer, no
   * connection — is retried until the attempts run out.
   */
  private async deliver(body: string, eventId: string, attempt: number): Promise<void> {
    const controller = new AbortController();
    this.inFlight.add(controller);

    let failure: string;
    try {
      const response = await fetch(this.webhookUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'MockPay-Signature': this.sign(body) },
        body,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(DELIVERY_TIMEOUT_MS)]),
      });
      // The answer's body is never read; release the connection.
      await response.body?.cancel();
      if (response.ok) return;
      failure = `answered ${response.status}`;
    } catch (error) {
      if (this.stopped) return;
      failure = `failed: ${String(error)}`;
    } finally {
      this.inFlight.delete(controller);
    }

    const retryInMs = RETRY_DELAYS_MS[attempt - 1];
    if (retryInMs === undefined) {
      this.logger.error(`Webhook ${eventId} abandoned after ${attempt} attempts (${failure})`);
      return;
    }
    this.logger.warn(
      `Webhook ${eventId} attempt ${attempt} ${failure}; retrying in ${retryInMs}ms`,
    );
    this.later(retryInMs, () => this.deliver(body, eventId, attempt + 1));
  }

  /**
   * `t=<unix seconds>,v1=<hex HMAC>` — signed afresh on every attempt, so a
   * retry made minutes later still falls inside the merchant's time window.
   */
  private sign(body: string): string {
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', this.config.getOrThrow<string>('MOCKPAY_WEBHOOK_SECRET'))
      .update(`${t}.${body}`)
      .digest('hex');
    return `t=${t},v1=${v1}`;
  }

  /**
   * MOCKPAY_WEBHOOK_URL when set; otherwise this API's own webhook endpoint,
   * at the port it is listening on — read per delivery, as tests listen on a
   * random port.
   */
  private webhookUrl(): string {
    const configured = this.config.get<string>('MOCKPAY_WEBHOOK_URL');
    if (configured) return configured;

    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Webhook URL unknown: the API is not listening on a port');
    }
    return `http://127.0.0.1:${address.port}/payments/webhook`;
  }
}
