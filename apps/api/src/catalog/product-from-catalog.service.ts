import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateProductFromCatalogInput, ProductWithOffers } from '@vinyl-order/shared';

import { PrismaService } from '../prisma/prisma.service';
import { resolveArtist } from './artist-resolver';
import { ListingReader, offerCreateOf } from './listing-reader';
import { findProductWithOffers } from './product-with-offers.mapper';

/**
 * Creates a record from a catalog listing (tracker.md §7.3, step 2): the
 * listing's page read live, the record and its first offer made from it.
 */
@Injectable()
export class ProductFromCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingReader,
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

    const adapter = this.listings.adapterFor(entry.supplier);
    // Before fetching: a listing already tracked needs no request to the shop.
    await this.listings.refuseIfTracked(entry.supplier, entry.externalId);
    const parsed = await this.listings.read(adapter, entry.url);
    const offer = offerCreateOf(entry.supplier, parsed, new Date());

    const id = await this.prisma
      .$transaction(async (tx) => {
        const artist = await resolveArtist(tx, parsed.artistNames, input);
        const product = await tx.product.create({
          data: {
            title: parsed.title || parsed.sourceTitle,
            imageUrl: parsed.imageUrl ?? entry.imageUrl,
            format: parsed.format ? [parsed.format] : [],
            edition: parsed.edition,
            artistId: artist.id,
            offers: { create: offer },
          },
          select: { id: true },
        });
        return product.id;
      })
      .catch((error: unknown) =>
        this.listings.rethrowIfTracked(error, entry.supplier, parsed.externalId),
      );

    const created = await findProductWithOffers(this.prisma, id);
    if (!created) throw new Error(`Product ${id} vanished after it was created`);
    return created;
  }
}
