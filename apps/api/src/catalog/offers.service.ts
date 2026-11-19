import { Injectable, NotFoundException } from '@nestjs/common';
import type { AttachOfferInput, AttachOfferResult } from '@vinyl-order/shared';

import { PrismaService } from '../prisma/prisma.service';
import { uniqueByNormalized } from './artist-resolver';
import { syncDemoPrice } from './demo-price';
import { ListingReader, offerCreateOf } from './listing-reader';
import { offerConflict } from './offer.errors';
import { findProductWithOffers } from './product-with-offers.mapper';

/**
 * A record's offers attached and detached by hand (tracker.md §7.3, step 4):
 * a candidate confirmed, a link pasted, a wrong match taken off.
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingReader,
  ) {}

  /**
   * The listing's page read live, and an offer made from it with its first
   * snapshot. The artist names that shop wrote and the artist lacks are
   * proposed, not added: a wrong match would otherwise teach the artist a
   * stranger's name.
   *
   * @throws 404 - no such tracked record, or no such listing
   * @throws 409 OFFER_ALREADY_TRACKED; 422 SHOP_NOT_SUPPORTED; 502 SHOP_PAGE_UNREADABLE
   */
  async attach(productId: string, input: AttachOfferInput): Promise<AttachOfferResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { artistRef: { select: { aliases: { select: { normalized: true } } } } },
    });
    if (!product?.artistRef) throw new NotFoundException('Product not found');

    const { adapter, url } = await this.listingToRead(input);
    const parsed = await this.listings.read(adapter, url);
    // A pasted link's id is known only once read; a candidate's was checked.
    if (input.url) await this.listings.refuseIfTracked(adapter.supplier, parsed.externalId);

    await this.prisma.offer
      .create({ data: { productId, ...offerCreateOf(adapter.supplier, parsed, new Date()) } })
      .catch((error: unknown) =>
        this.listings.rethrowIfTracked(error, adapter.supplier, parsed.externalId),
      );

    const known = new Set(product.artistRef.aliases.map((alias) => alias.normalized));
    const attached = await findProductWithOffers(this.prisma, productId);
    if (!attached) throw new NotFoundException('Product not found');
    return {
      product: attached,
      proposedAliases: uniqueByNormalized(parsed.artistNames)
        .filter((name) => !known.has(name.normalized))
        .map((name) => name.name),
    };
  }

  /**
   * A wrong match taken off, its history with it.
   *
   * @throws 404 - no such offer
   * @throws 409 LAST_OFFER - a record keeps at least one; delete the record instead
   */
  async detach(offerId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        select: { productId: true },
      });
      if (!offer) throw new NotFoundException('Offer not found');
      if ((await tx.offer.count({ where: { productId: offer.productId } })) <= 1) {
        throw offerConflict('LAST_OFFER', 'A record keeps at least one offer.');
      }
      await tx.offer.delete({ where: { id: offerId } });
      await syncDemoPrice(tx, offer.productId);
    });
  }

  private async listingToRead(input: AttachOfferInput) {
    if (input.url) return { adapter: this.listings.adapterForUrl(input.url), url: input.url };

    const entry = await this.prisma.catalogEntry.findUnique({
      where: { id: input.catalogEntryId },
    });
    if (!entry) throw new NotFoundException('Catalog entry not found');
    const adapter = this.listings.adapterFor(entry.supplier);
    // Before fetching: a listing already tracked needs no request to the shop.
    await this.listings.refuseIfTracked(entry.supplier, entry.externalId);
    return { adapter, url: entry.url };
  }
}
