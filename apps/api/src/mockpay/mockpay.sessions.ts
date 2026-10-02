import { randomUUID } from 'node:crypto';

import { ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';

/** How a session ended, or `open` while the customer has not chosen yet. */
export type MockPayOutcome = 'open' | 'paid' | 'declined';

/** One request to collect money, as MockPay — not our API — records it. */
export interface MockPaySession {
  /** Prefixed like a real provider's ids, so its origin shows in any log. */
  id: string;
  orderId: string;
  amountCents: number;
  currency: string;
  /** After this, the session refuses to take payment. */
  expiresAt: Date;
  /** Where the customer's browser goes once they pay or decline. */
  returnUrl: string;
  outcome: MockPayOutcome;
}

/** What a merchant sends to open a session. */
export type NewMockPaySession = Omit<MockPaySession, 'id' | 'outcome'>;

/**
 * MockPay's own record of sessions, and its rules for them.
 *
 * Kept in memory rather than in our database: MockPay stands in for a third
 * party, so it must not share our storage — and losing open sessions when the
 * API restarts is acceptable for a development stand-in.
 */
@Injectable()
export class MockPaySessions {
  private readonly sessions = new Map<string, MockPaySession>();

  create(input: NewMockPaySession): MockPaySession {
    const session: MockPaySession = { ...input, id: `mps_${randomUUID()}`, outcome: 'open' };
    this.sessions.set(session.id, session);
    return session;
  }

  /** The session, or 404. */
  find(id: string): MockPaySession {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException('Payment session not found');
    return session;
  }

  /**
   * Record the customer's choice. A session is settled once: pressing again,
   * from a second tab or the back button, is 409. After its deadline it takes
   * nothing — 410 — so an order cannot be paid once it has expired.
   */
  settle(id: string, outcome: Exclude<MockPayOutcome, 'open'>): MockPaySession {
    const session = this.find(id);
    if (session.outcome !== 'open') {
      throw new ConflictException('This payment session has already ended');
    }
    if (session.expiresAt <= new Date()) {
      throw new GoneException('This payment session has expired');
    }

    session.outcome = outcome;
    return session;
  }
}
