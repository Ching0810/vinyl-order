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
 * What a read of one offer came to: a drop is a change whose price fell, and
 * told its trackers; a failure kept the last good values.
 */
type Outcome = 'unchanged' | 'changed' | 'dropped' | 'failed';

/** What the nightly re-read did, in counts: the log is public (§10). */
export interface TrackedRefreshReport {
  /** Offers some member tracks, each read once. */
  offers: number;
  changed: number;
  /** Pages that couldn't be fetched or read: the last good values kept. */
  failed: number;
  /** Of the changed, how many dropped in price, each telling its trackers. */
  drops: number;
  ms: number;
}

/**
 * Re-reads offers from the shops' pages (tracker.md §5.2, §5.3), one after
 * another: a record's, inside a member's or the admin's request — one
 * album's listings, a handful — and every tracked one, nightly (§10). The
 * shops' fetchers queue their requests per host anyway.
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
   * Every offer some member tracks, read again (§10, 12b-2) — not the rest
   * of their records' offers, nor the catalog. No wait: the members' ten
   * minutes spare the shops many clicks, not one run. Oldest read first, so
   * a run cut short leaves the freshest for the next.
   */
  async refreshTracked(): Promise<TrackedRefreshReport> {
    const started = Date.now();
    const offers = await this.prisma.offer.findMany({
      where: { watches: { some: {} } },
      orderBy: [{ lastCheckedAt: 'asc' }, { id: 'asc' }],
    });

    const report = { offers: offers.length, changed: 0, failed: 0, drops: 0 };
    for (const offer of offers) {
      const outcome = await this.refreshOffer(offer);
      if (outcome === 'failed') report.failed += 1;
      if (outcome === 'changed' || outcome === 'dropped') report.changed += 1;
      if (outcome === 'dropped') report.drops += 1;
    }
    return { ...report, ms: Date.now() - started };
  }

  /**
   * One offer read again. A snapshot only when what it keeps changed (§5.3).
   * A lower price than the last good one tells each member tracking the
   * offer (§5.10), in the same transaction, so a drop is never recorded
   * without its notifications or told twice. A page that can't be fetched or
   * read keeps the last good values and says why — never a drop; one shop
   * failing doesn't stop the others.
   */
  private async refreshOffer(offer: Offer): Promise<Outcome> {
    const adapter = this.adapters[offer.supplier];
    try {
      if (!adapter) throw new ShopPageUnreadable('this shop can’t be read yet');
      const values = offerValuesOf(await adapter.fetchOffer(offer.url));
      const now = new Date();
      const changed = !sameSnapshot(snapshotOf(values), snapshotOf(offer));

      return await this.prisma.$transaction(async (tx): Promise<Outcome> => {
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
          return 'dropped';
        }
        return changed ? 'changed' : 'unchanged';
      });
    } catch (error) {
      if (!(error instanceof ShopFetchError || error instanceof ShopPageUnreadable)) throw error;
      await this.prisma.offer.update({
        where: { id: offer.id },
        data: { lastErrorAt: new Date(), lastError: error.message },
      });
      return 'failed';
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
