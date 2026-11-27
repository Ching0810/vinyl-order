import { Injectable, NotFoundException } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { readListingTitle } from './listing-title';
import { taipeiToday } from './supplier-adapter';

/**
 * The admin's corrections to search's albums (tracker.md §7.3, §5.9): a
 * listing split out of its album, for everyone, and put back.
 *
 * A split is stored by the listing, and grouping applies it at every search.
 * What it changes besides is a record that holds the listing among others:
 * its offer moves out to a record of its own, with its history and every
 * member's tracking of it, so the comparison it was wrongly in no longer
 * lists it. Putting back moves it home again, when nothing has changed since.
 */
@Injectable()
export class AlbumSplitsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Take a listing out of its album. Splitting one already split is no
   * error: the listing stays as it is.
   *
   * @throws 404 - no such listing in the catalog
   */
  async split(catalogEntryId: string): Promise<void> {
    const { supplier, externalId } = await this.entry(catalogEntryId);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.albumSplit.findUnique({
        where: { supplier_externalId: { supplier, externalId } },
      });
      if (existing) return;

      const offer = await tx.offer.findUnique({
        where: { supplier_externalId: { supplier, externalId } },
        select: {
          id: true,
          sourceTitle: true,
          imageUrl: true,
          product: { select: { id: true, artistId: true, _count: { select: { offers: true } } } },
        },
      });
      // A record holding only this listing is already its own album.
      const moveFrom = offer && offer.product._count.offers > 1 ? offer.product : null;

      await tx.albumSplit.create({
        data: { supplier, externalId, fromProductId: moveFrom?.id ?? null },
      });
      if (!offer || !moveFrom) return;

      const own = await createRecordFor(tx, { ...offer, artistId: moveFrom.artistId });
      await tx.offer.update({ where: { id: offer.id }, data: { productId: own } });
    });
  }

  /**
   * Put a split listing back: it groups by title again at the next search.
   * If its offer was moved out and its record still holds only it, the offer
   * moves back to the record it came from, and the emptied record goes.
   * Putting back one not split is no error.
   *
   * @throws 404 - no such listing in the catalog
   */
  async putBack(catalogEntryId: string): Promise<void> {
    const { supplier, externalId } = await this.entry(catalogEntryId);

    await this.prisma.$transaction(async (tx) => {
      const key = { supplier_externalId: { supplier, externalId } };
      const split = await tx.albumSplit.findUnique({ where: key });
      if (!split) return;
      await tx.albumSplit.delete({ where: key });
      if (!split.fromProductId) return;

      const offer = await tx.offer.findUnique({
        where: { supplier_externalId: { supplier, externalId } },
        select: {
          id: true,
          product: { select: { id: true, _count: { select: { offers: true } } } },
        },
      });
      // Tracked again, or attached to another record since: left where it is.
      if (!offer || offer.product._count.offers > 1) return;
      if (offer.product.id === split.fromProductId) return;

      await tx.offer.update({
        where: { id: offer.id },
        data: { productId: split.fromProductId },
      });
      await tx.product.delete({ where: { id: offer.product.id } });
    });
  }

  /** @throws 404 - no such listing in the catalog */
  private async entry(catalogEntryId: string) {
    const entry = await this.prisma.catalogEntry.findUnique({
      where: { id: catalogEntryId },
      select: { supplier: true, externalId: true },
    });
    if (!entry) throw new NotFoundException('Catalog entry not found');
    return entry;
  }
}

/**
 * A record of its own for an offer split out of another's: the same artist,
 * its title and pressing read from the offer's own title, as a record made
 * from a listing is (§6.2).
 *
 * @returns the new record's id
 */
const createRecordFor = async (
  tx: Prisma.TransactionClient,
  offer: { sourceTitle: string; imageUrl: string | null; artistId: string },
): Promise<string> => {
  const read = readListingTitle(offer.sourceTitle, taipeiToday());
  const product = await tx.product.create({
    data: {
      title: read.title || offer.sourceTitle,
      imageUrl: offer.imageUrl,
      format: read.format ? [read.format] : [],
      edition: read.edition,
      artistId: offer.artistId,
    },
    select: { id: true },
  });
  return product.id;
};
