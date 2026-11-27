import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ProductWithOffers } from '@vinyl-order/shared';

import type { Offer, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPLIER_ADAPTERS, type SupplierAdapters } from './adapters';
import { refreshTooSoon } from './offer.errors';
import { findProductWithOffers, offerValuesOf, snapshotOf } from './product-with-offers.mapper';
import { ShopFetchError } from './shop-fetcher';
import { ShopPageUnreadable } from './supplier-adapter';

/**
 * Re-reads a record's offers from the shops' pages (tracker.md §5.2, §5.3),
 * one after another, inside the request: a record holds one album's
 * listings, a handful, and the shops' fetchers queue their requests anyway.
 * Scheduled refreshes are step 12's.
 */
@Injectable()
export class OfferRefreshService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUPPLIER_ADAPTERS) private readonly adapters: SupplierAdapters,
  ) {}

  /**
   * @param minInterval - for a member's refresh: the least time, in ms,
   *   since the record was last read — a read that failed counts — so many
   *   members pressing it read the shops once
   * @throws 404 - no such tracked record
   * @throws 429 REFRESH_TOO_SOON - read again within `minInterval`
   */
  async refresh(productId: string, { minInterval = 0 } = {}): Promise<ProductWithOffers> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { offers: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!product) throw new NotFoundException('Product not found');

    const lastRead = Math.max(
      0,
      ...product.offers.flatMap((offer) => [
        offer.lastCheckedAt.getTime(),
        offer.lastErrorAt?.getTime() ?? 0,
      ]),
    );
    const wait = lastRead + minInterval - Date.now();
    if (wait > 0) throw refreshTooSoon(Math.ceil(wait / 1000));

    for (const offer of product.offers) await this.refreshOffer(offer);

    const refreshed = await findProductWithOffers(this.prisma, productId);
    if (!refreshed) throw new NotFoundException('Product not found');
    return refreshed;
  }

  /**
   * One offer read again. A snapshot only when what it keeps changed (§5.3).
   * A lower price than the last good one tells each member tracking the
   * offer (§5.10), in the same transaction, so a drop is never recorded
   * without its notifications or told twice. A page that can't be fetched or
   * read keeps the last good values and says why — never a drop; one shop
   * failing doesn't stop the others.
   */
  private async refreshOffer(offer: Offer): Promise<void> {
    const adapter = this.adapters[offer.supplier];
    try {
      if (!adapter) throw new ShopPageUnreadable('this shop can’t be read yet');
      const values = offerValuesOf(await adapter.fetchOffer(offer.url));
      const now = new Date();
      const changed = !sameSnapshot(snapshotOf(values), snapshotOf(offer));

      await this.prisma.$transaction(async (tx) => {
        // The price as it stands, under the row's lock: a read running
        // alongside (the nightly one and a member's) waits here, then sees
        // this one's price, so a drop is told once.
        const [current] = await tx.$queryRaw<{ priceCents: number }[]>`
          SELECT "priceCents" FROM "Offer" WHERE "id" = ${offer.id} FOR UPDATE
        `;
        await tx.offer.update({
          where: { id: offer.id },
          data: {
            ...values,
            lastCheckedAt: now,
            lastErrorAt: null,
            lastError: null,
            ...(changed ? { snapshots: { create: { ...snapshotOf(values), takenAt: now } } } : {}),
          },
        });
        if (current && values.priceCents < current.priceCents) {
          await notifyPriceDrop(tx, {
            offerId: offer.id,
            fromPriceCents: current.priceCents,
            toPriceCents: values.priceCents,
            currency: values.currency,
            now,
          });
        }
      });
    } catch (error) {
      if (!(error instanceof ShopFetchError || error instanceof ShopPageUnreadable)) throw error;
      await this.prisma.offer.update({
        where: { id: offer.id },
        data: { lastErrorAt: new Date(), lastError: error.message },
      });
    }
  }
}

/** A notification for each member tracking the offer now (§5.10). */
const notifyPriceDrop = async (
  tx: Prisma.TransactionClient,
  drop: {
    offerId: string;
    fromPriceCents: number;
    toPriceCents: number;
    currency: string;
    now: Date;
  },
): Promise<void> => {
  const watches = await tx.offerWatch.findMany({
    where: { offerId: drop.offerId },
    select: { userId: true },
  });
  if (watches.length === 0) return;
  await tx.notification.createMany({
    data: watches.map(({ userId }) => ({
      userId,
      offerId: drop.offerId,
      kind: 'price_drop' as const,
      fromPriceCents: drop.fromPriceCents,
      toPriceCents: drop.toPriceCents,
      currency: drop.currency,
      createdAt: drop.now,
    })),
  });
};

type Snapshot = ReturnType<typeof snapshotOf>;

const sameSnapshot = (a: Snapshot, b: Snapshot): boolean =>
  a.priceCents === b.priceCents &&
  a.availability === b.availability &&
  a.stockQty === b.stockQty &&
  a.expectedAt?.getTime() === b.expectedAt?.getTime();
