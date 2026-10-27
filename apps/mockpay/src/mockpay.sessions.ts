import { randomUUID } from 'node:crypto';

import { ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';

import type { MockPayOutcome, MockPaySession } from './generated/prisma/client';
import { MockPayPrisma } from './mockpay.prisma';

/**
 * How a session ended, or `open` while the customer has not chosen yet; and
 * one request to collect money, as MockPay — not our API — records it. Both
 * come from MockPay's schema (prisma/schema.prisma), which documents them.
 */
export type { MockPayOutcome, MockPaySession };

/** What a merchant sends to open a session. */
export type NewMockPaySession = Omit<MockPaySession, 'id' | 'outcome' | 'createdAt' | 'updatedAt'>;

/**
 * MockPay's own record of sessions, and its rules for them.
 *
 * Kept in MockPay's own database, never ours: MockPay stands in for a third
 * party, so it must not share our storage. A restart forgets nothing, so a
 * merchant can still void a session the customer opened before it
 * (docs/design/deploy.md §6.5).
 *
 * A session moves off `open` once, and never again. Each move is a single
 * conditional UPDATE — "only if still open" — so when a Pay press and a void
 * arrive together, the database lets exactly one of them through.
 */
@Injectable()
export class MockPaySessions {
  constructor(private readonly prisma: MockPayPrisma) {}

  create(input: NewMockPaySession): Promise<MockPaySession> {
    return this.prisma.mockPaySession.create({
      data: { ...input, id: `mps_${randomUUID()}` },
    });
  }

  /** The session, or 404. */
  async find(id: string): Promise<MockPaySession> {
    const session = await this.prisma.mockPaySession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Payment session not found');
    return session;
  }

  /**
   * Record the customer's choice. A session is settled once: pressing again,
   * from a second tab or the back button, is 409. After its deadline, or once
   * the merchant has voided it, it takes nothing — 410 — so an order cannot be
   * paid once it has expired or been cancelled.
   *
   * The checks are the UPDATE's own conditions rather than a read before it:
   * between a read and a write, a void could slip in, and the customer would
   * be told they paid for a session the merchant was told is void.
   */
  async settle(id: string, outcome: 'paid' | 'declined'): Promise<MockPaySession> {
    const { count } = await this.prisma.mockPaySession.updateMany({
      where: { id, outcome: 'open', expiresAt: { gt: new Date() } },
      data: { outcome },
    });
    // A settled session never changes again, so this reads what was decided.
    const session = await this.find(id);
    if (count === 1) return session;

    // Nothing changed: say why, from how the session stands.
    if (session.outcome === 'expired') {
      throw new GoneException('This payment session has been cancelled');
    }
    if (session.outcome !== 'open') {
      throw new ConflictException('This payment session has already ended');
    }
    throw new GoneException('This payment session has expired');
  }

  /**
   * The merchant voids a session, so the customer can no longer pay it.
   *
   * Only an open session changes; one already paid or declined keeps its
   * outcome, which the answer reports — so the merchant learns whether money
   * was taken. Safe to repeat. If the customer presses Pay at the same moment,
   * whichever UPDATE reaches the row first decides, and this reports it.
   */
  async expire(id: string): Promise<MockPaySession> {
    await this.prisma.mockPaySession.updateMany({
      where: { id, outcome: 'open' },
      data: { outcome: 'expired' },
    });
    return this.find(id);
  }
}
