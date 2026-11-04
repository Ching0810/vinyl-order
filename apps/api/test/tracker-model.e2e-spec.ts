import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { violatesUniqueIndex } from '../src/prisma/unique-violation';

/**
 * The supplier tracker's rules that live in the database rather than in code
 * (docs/design/tracker.md §5): CHECKs, unique indexes, what a delete takes
 * with it, and the trigram index. Nothing writes these tables yet, so they
 * are pinned here, against a real Postgres, before anything relies on them.
 */
describe('Tracker data model (e2e)', () => {
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

  const createProduct = () =>
    prisma.product.create({
      data: { title: `Album ${randomUUID()}`, artist: 'Test Artist', priceCents: 1_000 },
    });

  /** An offer on a new product, with a fresh external id so runs don't clash. */
  const createOffer = async (data: { stockQty?: number | null; reservedQty?: number } = {}) => {
    const product = await createProduct();
    return prisma.offer.create({
      data: {
        productId: product.id,
        supplier: 'tht',
        externalId: randomUUID(),
        url: 'https://www.thtrecords.com/products/test',
        sourceTitle: 'Test Album',
        priceCents: 1_200,
        availability: 'in_stock',
        lastCheckedAt: new Date(),
        ...data,
      },
    });
  };

  describe('Offer counts', () => {
    it('accepts a null stockQty: the shop does not say', async () => {
      const offer = await createOffer({ stockQty: null });

      expect(offer.stockQty).toBeNull();
      expect(offer.reservedQty).toBe(0);
    });

    // The CHECK's name is in Postgres's message; matching it proves this CHECK
    // refused the write, not some other rule.
    it('refuses a negative stockQty', async () => {
      await expect(createOffer({ stockQty: -1 })).rejects.toThrow('Offer_stockQty_non_negative');
    });

    it('refuses a reservedQty taken below zero', async () => {
      const offer = await createOffer({ stockQty: 2 });

      await expect(
        prisma.offer.update({
          where: { id: offer.id },
          data: { reservedQty: { decrement: 1 } },
        }),
      ).rejects.toThrow('Offer_reservedQty_non_negative');
    });
  });

  describe('unique listings and orders', () => {
    it('tracks one shop listing once', async () => {
      const offer = await createOffer();
      const other = await createProduct();

      const error = await errorFrom(
        prisma.offer.create({
          data: {
            productId: other.id,
            supplier: offer.supplier,
            externalId: offer.externalId,
            url: offer.url,
            sourceTitle: offer.sourceTitle,
            priceCents: offer.priceCents,
            availability: offer.availability,
            lastCheckedAt: new Date(),
          },
        }),
      );

      expect(violatesUniqueIndex(error, 'Offer_supplier_externalId_key')).toBe(true);
    });

    it('lets two shops use the same external id', async () => {
      const offer = await createOffer();

      await expect(
        prisma.offer.create({
          data: {
            productId: offer.productId,
            supplier: 'cosmic',
            externalId: offer.externalId,
            url: 'https://www.cosmicmusicrecord.com/products/test',
            sourceTitle: offer.sourceTitle,
            priceCents: offer.priceCents,
            availability: 'pre_order',
            lastCheckedAt: new Date(),
          },
        }),
      ).resolves.toBeDefined();
    });

    it('refuses the same supplier order entered twice', async () => {
      const data = {
        supplier: 'candlelight' as const,
        orderNumber: randomUUID(),
        orderedAt: new Date('2026-10-30'),
      };
      await prisma.supplierOrder.create({ data });

      const error = await errorFrom(prisma.supplierOrder.create({ data }));

      expect(violatesUniqueIndex(error, 'SupplierOrder_supplier_orderNumber_key')).toBe(true);
    });
  });

  describe('deleting an offer', () => {
    it('keeps order lines, unlinked, and drops cart lines and history', async () => {
      const offer = await createOffer({ stockQty: 3 });
      await prisma.offerSnapshot.create({
        data: { offerId: offer.id, priceCents: 1_200, availability: 'in_stock', stockQty: 3 },
      });

      const supplierOrder = await prisma.supplierOrder.create({
        data: {
          supplier: 'tht',
          orderNumber: randomUUID(),
          orderedAt: new Date('2026-10-30'),
          items: { create: { offerId: offer.id, title: 'Test Album', unitPriceCents: 1_200 } },
        },
        include: { items: true },
      });

      const user = await prisma.user.create({
        data: { email: `user-${randomUUID()}@test.local`, passwordHash: 'unused' },
      });
      const cart = await prisma.cart.create({ data: { userId: user.id } });
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId: offer.productId, offerId: offer.id },
      });
      const order = await prisma.order.create({
        data: {
          userId: user.id,
          subtotalCents: 1_200,
          currency: 'TWD',
          expiresAt: new Date(),
          items: {
            create: {
              productId: offer.productId,
              offerId: offer.id,
              supplier: 'tht',
              quantity: 1,
              unitPriceCents: 1_200,
              title: 'Test Album',
              artist: 'Test Artist',
            },
          },
        },
        include: { items: true },
      });

      await prisma.offer.delete({ where: { id: offer.id } });

      // A supplier order is a note of a real purchase: its line outlives the
      // offer, with its copied title, as a typed line would.
      const supplierLine = await prisma.supplierOrderItem.findUniqueOrThrow({
        where: { id: supplierOrder.items[0].id },
      });
      expect(supplierLine).toMatchObject({ offerId: null, title: 'Test Album' });

      // The demo order's line keeps which shop it was "bought" from.
      const orderLine = await prisma.orderItem.findUniqueOrThrow({
        where: { id: order.items[0].id },
      });
      expect(orderLine).toMatchObject({ offerId: null, supplier: 'tht' });

      // A cart line for an offer that's gone can't be bought.
      expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
      expect(await prisma.offerSnapshot.count({ where: { offerId: offer.id } })).toBe(0);
    });
  });

  describe('artists', () => {
    it('refuses to delete an artist that still has records', async () => {
      const artist = await prisma.artist.create({ data: { name: '坂本龍一' } });
      await prisma.product.create({
        data: { title: '1996', artist: '坂本龍一', priceCents: 1_550, artistId: artist.id },
      });

      await expect(prisma.artist.delete({ where: { id: artist.id } })).rejects.toThrow();
      expect(await prisma.artist.count({ where: { id: artist.id } })).toBe(1);
    });

    it('keeps aliases unique per artist, not across artists', async () => {
      const [first, second] = await Promise.all([
        prisma.artist.create({ data: { name: 'Shared Name' } }),
        prisma.artist.create({ data: { name: 'Shared Name' } }),
      ]);
      const alias = { name: 'Shared Name', normalized: 'sharedname' };
      await prisma.artistAlias.create({ data: { artistId: first.id, ...alias } });

      // Two artists may share a name; that is shown to me, not refused.
      await expect(
        prisma.artistAlias.create({ data: { artistId: second.id, ...alias } }),
      ).resolves.toBeDefined();

      const error = await errorFrom(
        prisma.artistAlias.create({ data: { artistId: first.id, ...alias } }),
      );
      expect(violatesUniqueIndex(error, 'ArtistAlias_artistId_normalized_key')).toBe(true);
    });

    // pg_trgm's `%` is "similar enough" (similarity above 0.3 by default): a
    // misspelt search still finds the artist, an unrelated one doesn't.
    it('finds an alias by a near spelling', async () => {
      const artist = await prisma.artist.create({
        data: {
          name: '坂本龍一',
          aliases: { create: { name: 'Ryuichi Sakamoto', normalized: 'ryuichisakamoto' } },
        },
      });

      const similarTo = (query: string) =>
        prisma.$queryRaw<{ artistId: string }[]>`
          SELECT "artistId" FROM "ArtistAlias"
          WHERE "artistId" = ${artist.id} AND normalized % ${query}`;

      expect(await similarTo('ryuichisakamto')).toHaveLength(1);
      expect(await similarTo('radiohead')).toHaveLength(0);
    });
  });
});
