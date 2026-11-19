import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ProductWithOffers } from '@vinyl-order/shared';

import type { Offer } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPLIER_ADAPTERS, type SupplierAdapters } from './adapters';
import { findProductWithOffers, offerValuesOf, snapshotOf } from './product-with-offers.mapper';
import { ShopFetchError } from './shop-fetcher';
import { ShopPageUnreadable } from './supplier-adapter';

/**
 * Re-reads a record's offers from the shops' pages (tracker.md §5.2, §5.3),
 * one after another, inside the request: a record has at most four, and the
 * shops' fetchers queue their requests anyway. Scheduled refreshes are
 * step 12's.
 */
@Injectable()
export class OfferRefreshService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUPPLIER_ADAPTERS) private readonly adapters: SupplierAdapters,
  ) {}

  /** @throws 404 - no such tracked record */
  async refresh(productId: string): Promise<ProductWithOffers> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { artistId: true, offers: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!product?.artistId) throw new NotFoundException('Product not found');

    for (const offer of product.offers) await this.refreshOffer(offer);

    const refreshed = await findProductWithOffers(this.prisma, productId);
    if (!refreshed) throw new NotFoundException('Product not found');
    const [first] = refreshed.offers;
    if (first) {
      // The demo store's price, read until step 5 drops it (§14).
      await this.prisma.product.update({
        where: { id: productId },
        data: { priceCents: first.priceCents, currency: first.currency },
      });
    }
    return refreshed;
  }

  /**
   * One offer read again. A snapshot only when what it keeps changed (§5.3).
   * A page that can't be fetched or read keeps the last good values and
   * says why; one shop failing doesn't stop the others.
   */
  private async refreshOffer(offer: Offer): Promise<void> {
    const adapter = this.adapters[offer.supplier];
    try {
      if (!adapter) throw new ShopPageUnreadable('this shop can’t be read yet');
      const values = offerValuesOf(await adapter.fetchOffer(offer.url));
      const now = new Date();
      const changed = !sameSnapshot(snapshotOf(values), snapshotOf(offer));

      await this.prisma.offer.update({
        where: { id: offer.id },
        data: {
          ...values,
          lastCheckedAt: now,
          lastErrorAt: null,
          lastError: null,
          ...(changed ? { snapshots: { create: { ...snapshotOf(values), takenAt: now } } } : {}),
        },
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

type Snapshot = ReturnType<typeof snapshotOf>;

const sameSnapshot = (a: Snapshot, b: Snapshot): boolean =>
  a.priceCents === b.priceCents &&
  a.availability === b.availability &&
  a.stockQty === b.stockQty &&
  a.expectedAt?.getTime() === b.expectedAt?.getTime();
