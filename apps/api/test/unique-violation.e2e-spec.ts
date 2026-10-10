import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { violatesUniqueIndex } from '../src/prisma/unique-violation';

/**
 * Recognising which unique index a write broke, against a real Postgres.
 *
 * Races that lose to a unique index — a repeated checkout, two payments opened
 * at once — are answered by reading back the winner, so they depend on this
 * check. The races themselves rarely reach the index (checkout's loser is
 * usually stopped at the cart first), so the check is tested on its own: the
 * error shape is Prisma's to change, and it did once without any race test
 * noticing. A mocked error would only repeat our assumption about that shape.
 */
describe('violatesUniqueIndex (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** The error a write throws, so a test can assert on it. */
  const errorFrom = async (write: Promise<unknown>): Promise<unknown> => {
    try {
      await write;
    } catch (error) {
      return error;
    }
    throw new Error('Expected the write to fail');
  };

  const createUser = () =>
    prisma.user.create({
      data: { email: `user-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });

  // The index name is written out rather than imported, so a change in what
  // Prisma names it fails here — not silently in checkout.
  it('recognises the index the write broke', async () => {
    const user = await createUser();
    const data = {
      userId: user.id,
      subtotalCents: 0,
      currency: 'TWD',
      idempotencyKey: 'k',
      expiresAt: new Date(),
    };
    await prisma.order.create({ data });

    const error = await errorFrom(prisma.order.create({ data }));

    expect(violatesUniqueIndex(error, 'Order_userId_idempotencyKey_key')).toBe(true);
  });

  // A primary key is enforced by a unique index of its own, named <table>_pkey;
  // the webhook handler recognises a redelivered event by it.
  it('recognises a primary key the write broke', async () => {
    const data = { id: `evt_${randomUUID()}`, type: 'payment.succeeded' };
    await prisma.paymentEvent.create({ data });

    const error = await errorFrom(prisma.paymentEvent.create({ data }));

    expect(violatesUniqueIndex(error, 'PaymentEvent_pkey')).toBe(true);
  });

  it('ignores a violation of some other unique index', async () => {
    const user = await createUser();
    const duplicateEmail = prisma.user.create({
      data: { email: user.email, passwordHash: 'unused' },
    });

    expect(
      violatesUniqueIndex(await errorFrom(duplicateEmail), 'Order_userId_idempotencyKey_key'),
    ).toBe(false);
  });

  it('ignores an error that is not a unique violation', () => {
    expect(violatesUniqueIndex(new Error('boom'), 'Order_userId_idempotencyKey_key')).toBe(false);
  });
});
