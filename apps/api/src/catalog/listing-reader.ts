import { Inject, Injectable } from '@nestjs/common';
import type { Supplier } from '@vinyl-order/shared';

import { PrismaService } from '../prisma/prisma.service';
import { violatesUniqueIndex } from '../prisma/unique-violation';
import { SUPPLIER_ADAPTERS, type SupplierAdapters } from './adapters';
import { offerConflict, offerUnprocessable, shopPageUnreadable } from './offer.errors';
import { offerValuesOf, snapshotOf } from './product-with-offers.mapper';
import { ShopFetchError } from './shop-fetcher';
import { type ParsedOffer, ShopPageUnreadable, type SupplierAdapter } from './supplier-adapter';

/** The index that keeps a shop's listing under one record. */
const OFFER_LISTING_INDEX = 'Offer_supplier_externalId_key';

/**
 * A shop's listing read for an offer, by whatever starts one — a record made
 * from a listing, or an offer attached to a record (tracker.md §7.3): which
 * shop reads it, whether it's tracked already, its page read live, and the
 * offer and first snapshot made from it.
 */
@Injectable()
export class ListingReader {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUPPLIER_ADAPTERS) private readonly adapters: SupplierAdapters,
  ) {}

  /** @throws 422 SHOP_NOT_SUPPORTED */
  adapterFor(supplier: Supplier): SupplierAdapter {
    const adapter = this.adapters[supplier];
    if (!adapter) throw offerUnprocessable('SHOP_NOT_SUPPORTED', 'This shop can’t be read yet.');
    return adapter;
  }

  /**
   * The shop a pasted link belongs to, by its host.
   *
   * @throws 422 SHOP_NOT_SUPPORTED - none of the shops an adapter reads
   */
  adapterForUrl(url: string): SupplierAdapter {
    const host = new URL(url).hostname.toLowerCase();
    const adapter = Object.values(this.adapters).find((candidate) =>
      candidate.rules.hosts.includes(host),
    );
    if (!adapter) {
      throw offerUnprocessable('SHOP_NOT_SUPPORTED', 'This link isn’t to a shop this site reads.');
    }
    return adapter;
  }

  /** @throws 409 OFFER_ALREADY_TRACKED - with the record that tracks it */
  async refuseIfTracked(supplier: Supplier, externalId: string): Promise<void> {
    const tracked = await this.prisma.offer.findUnique({
      where: { supplier_externalId: { supplier, externalId } },
      select: { productId: true },
    });
    if (tracked) {
      throw offerConflict('OFFER_ALREADY_TRACKED', 'This listing is already tracked.', {
        productId: tracked.productId,
      });
    }
  }

  /**
   * The listing's page, read now.
   *
   * @throws 502 SHOP_PAGE_UNREADABLE - with the fetcher's or reader's phrase
   */
  async read(adapter: SupplierAdapter, url: string): Promise<ParsedOffer> {
    try {
      return await adapter.fetchOffer(url);
    } catch (error) {
      if (error instanceof ShopFetchError || error instanceof ShopPageUnreadable) {
        throw shopPageUnreadable(error.message);
      }
      throw error;
    }
  }

  /**
   * A write that failed because another request tracked the listing while
   * this one read the shop: the same 409 as if it had been tracked before.
   */
  async rethrowIfTracked(error: unknown, supplier: Supplier, externalId: string): Promise<never> {
    if (violatesUniqueIndex(error, OFFER_LISTING_INDEX)) {
      await this.refuseIfTracked(supplier, externalId);
    }
    throw error;
  }
}

/**
 * An offer's nested create from a read page, with its first snapshot: history
 * starts at the first price known (§5.3).
 */
export const offerCreateOf = (supplier: Supplier, parsed: ParsedOffer, now: Date) => {
  const values = offerValuesOf(parsed);
  return {
    supplier,
    externalId: parsed.externalId,
    ...values,
    lastCheckedAt: now,
    snapshots: { create: { ...snapshotOf(values), takenAt: now } },
  };
};
