import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:net';

import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { z } from 'zod';

import {
  CreateSessionInput,
  PaymentProvider,
  PaymentSession,
  PaymentWebhookEvent,
  WebhookHeaders,
} from './payment-provider';

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

/** Carries `t=<unix seconds>,v1=<hex HMAC-SHA256>`. Node lower-cases header names. */
const SIGNATURE_HEADER = 'mockpay-signature';

/**
 * How far a webhook's timestamp may be from now, either way. Older is refused
 * so a captured webhook cannot be replayed later; newer, so a forged future
 * timestamp cannot stretch that window.
 */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/**
 * MockPay's webhook body, as it arrives over the wire — again declared here,
 * not imported. Only the fields we read: requiring the rest would make us
 * refuse a webhook over a field we ignore.
 */
const mockPayWebhookSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['payment.succeeded', 'payment.failed']),
  data: z.object({
    sessionId: z.string().min(1),
    amountCents: z.number().int(),
    currency: z.string().min(1),
  }),
});

/** Who sent this can't be proven: no detail in the response, which an attacker reads. */
const invalidSignature = () => new BadRequestException('Invalid webhook signature');

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
   * Prove a webhook came from MockPay, then read it — in that order: nothing
   * is parsed, let alone trusted, until the signature holds.
   *
   * MockPay signs `<t>.<raw body>` with HMAC-SHA256 under the shared secret
   * (Stripe's scheme). Without the secret nobody can produce a matching
   * signature, and changing one byte of the body breaks it.
   */
  verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): PaymentWebhookEvent {
    const header = headers[SIGNATURE_HEADER];
    const signature = typeof header === 'string' ? parseSignature(header) : null;
    if (!signature) {
      this.logger.warn('Webhook refused: missing or malformed signature header');
      throw invalidSignature();
    }

    const ageSeconds = Math.abs(Date.now() / 1000 - signature.timestamp);
    if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
      this.logger.warn(`Webhook refused: timestamp ${signature.timestamp} is outside tolerance`);
      throw invalidSignature();
    }

    const expected = createHmac('sha256', this.config.getOrThrow<string>('MOCKPAY_WEBHOOK_SECRET'))
      .update(`${signature.timestamp}.`)
      .update(rawBody)
      .digest();
    // timingSafeEqual takes as long wherever the bytes differ, so response time
    // reveals nothing about how much of a guess was right. It throws on unequal
    // lengths, so those are refused first.
    if (
      signature.digest.length !== expected.length ||
      !timingSafeEqual(signature.digest, expected)
    ) {
      this.logger.warn('Webhook refused: signature does not match');
      throw invalidSignature();
    }

    const parsed = mockPayWebhookSchema.safeParse(parseJson(rawBody));
    if (!parsed.success) {
      // Signed by MockPay but unreadable: worth a loud log, since it means the
      // two sides disagree on the format.
      this.logger.error(`MockPay webhook in an unexpected shape: ${parsed.error.message}`);
      throw new BadRequestException('Malformed webhook payload');
    }

    const { id, type, data } = parsed.data;
    return {
      id,
      type,
      providerSessionId: data.sessionId,
      amountCents: data.amountCents,
      currency: data.currency,
    };
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

/**
 * Read `t=<unix seconds>,v1=<hex>`, or null if it isn't exactly that. Strict
 * on purpose: anything unexpected is refused rather than guessed at.
 */
const parseSignature = (header: string): { timestamp: number; digest: Buffer } | null => {
  const parts = new Map(
    header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')] as const;
    }),
  );
  const t = parts.get('t');
  const v1 = parts.get('v1');
  if (!t || !/^\d+$/.test(t) || !v1 || !/^[0-9a-f]+$/i.test(v1) || v1.length % 2 !== 0) {
    return null;
  }
  return { timestamp: Number(t), digest: Buffer.from(v1, 'hex') };
};

/** The body as JSON, or undefined — which the schema then refuses. */
const parseJson = (rawBody: Buffer): unknown => {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return undefined;
  }
};
