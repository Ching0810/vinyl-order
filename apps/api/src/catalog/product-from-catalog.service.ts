import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateProductFromCatalogInput,
  ProductWithOffers,
  Supplier,
} from '@vinyl-order/shared';

import { PrismaService } from '../prisma/prisma.service';
import { violatesUniqueIndex } from '../prisma/unique-violation';
import { SUPPLIER_ADAPTERS, type SupplierAdapters } from './adapters';
import { resolveArtist } from './artist-resolver';
import { offerConflict, offerUnprocessable, shopPageUnreadable } from './offer.errors';
import { findProductWithOffers, offerValuesOf, snapshotOf } from './product-with-offers.mapper';
import { ShopFetchError } from './shop-fetcher';
import { type ParsedOffer, ShopPageUnreadable } from './supplier-adapter';

/** The index that keeps a shop's listing under one record. */
const OFFER_LISTING_INDEX = 'Offer_supplier_externalId_key';

/**
 * Creates a record from a catalog listing (tracker.md §7.3, step 2): the
 * listing's page read live, the record and its first offer made from it.
 */
@Injectable()
export class ProductFromCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUPPLIER_ADAPTERS) private readonly adapters: SupplierAdapters,
  ) {}

  /**
   * @throws 404 - no such listing
   * @throws 409 OFFER_ALREADY_TRACKED, ARTIST_AMBIGUOUS; 422 ARTIST_UNREAD,
   *   SHOP_NOT_SUPPORTED; 502 SHOP_PAGE_UNREADABLE
   */
  async create(input: CreateProductFromCatalogInput): Promise<ProductWithOffers> {
    const entry = await this.prisma.catalogEntry.findUnique({
      where: { id: input.catalogEntryId },
    });
    if (!entry) throw new NotFoundException('Catalog entry not found');

    const adapter = this.adapters[entry.supplier];
    if (!adapter) {
      throw offerUnprocessable('SHOP_NOT_SUPPORTED', 'This shop can’t be read yet.');
    }
    // Before fetching: a listing already tracked needs no request to the shop.
    await this.refuseIfTracked(entry.supplier, entry.externalId);

    const parsed = await readOffer(() => adapter.fetchOffer(entry.url));
    const offer = offerValuesOf(parsed);
    const now = new Date();

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const artist = await resolveArtist(tx, parsed.artistNames, input);
        const product = await tx.product.create({
          data: {
            title: parsed.title || parsed.sourceTitle,
            imageUrl: parsed.imageUrl ?? entry.imageUrl,
            format: parsed.format ? [parsed.format] : [],
            edition: parsed.edition,
            artistId: artist.id,
            // The demo store's columns, read until step 5 drops them (§14).
            artist: artist.name,
            priceCents: offer.priceCents,
            currency: offer.currency,
            stock: 0,
            offers: {
              create: {
                supplier: entry.supplier,
                externalId: parsed.externalId,
                ...offer,
                lastCheckedAt: now,
                // History starts at the first price known (§5.3).
                snapshots: { create: { ...snapshotOf(offer), takenAt: now } },
              },
            },
          },
          select: { id: true },
        });
        return product.id;
      });
      const created = await findProductWithOffers(this.prisma, id);
      if (!created) throw new Error(`Product ${id} vanished after it was created`);
      return created;
    } catch (error) {
      // Another request tracked it while this one read the shop.
      if (violatesUniqueIndex(error, OFFER_LISTING_INDEX)) {
        await this.refuseIfTracked(entry.supplier, parsed.externalId);
      }
      throw error;
    }
  }

  private async refuseIfTracked(supplier: Supplier, externalId: string): Promise<void> {
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
}

/** A shop's page read, or a 502 saying why it couldn't be. */
const readOffer = async (fetch: () => Promise<ParsedOffer>): Promise<ParsedOffer> => {
  try {
    return await fetch();
  } catch (error) {
    if (error instanceof ShopFetchError || error instanceof ShopPageUnreadable) {
      throw shopPageUnreadable(error.message);
    }
    throw error;
  }
};
