import { Injectable, NotFoundException } from '@nestjs/common';
import {
  isBuyable,
  type TrackListingInput,
  type TrackListingResult,
  type WatchedOffer,
} from '@vinyl-order/shared';

import { PrismaService } from '../prisma/prisma.service';
import { splitsAmong } from './album-splits';
import { offerErrorBodyOf, shopPageUnreadable } from './offer.errors';
import { OffersService } from './offers.service';
import { ProductFromCatalogService } from './product-from-catalog.service';
import { findProductWithOffers } from './product-with-offers.mapper';

/**
 * Each user's list of the listings they track (tracker.md §5.8) — one version
 * of an album at one shop, its own price — and tracking one from search: the
 * album's record found or made, every listing of the album attached so its
 * comparison is whole, and the one listing put on the user's list.
 */
@Injectable()
export class WatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fromCatalog: ProductFromCatalogService,
    private readonly offers: OffersService,
  ) {}

  /**
   * One listing tracked, its album's listings given with it.
   *
   * The record is the one holding any of the album's listings already, or a
   * new one made from the listing tracked. Then each of the album's listings
   * no record holds is attached, read live: two pressings at a shop are two
   * offers, two rows of the comparison. A listing another record holds, or a
   * page that can't be read, is skipped and said so — except the one being
   * tracked, which must be read; one another record holds is tracked there.
   *
   * A listing the admin split out of its album (§7.3) has no companions: if
   * it's the one tracked, none of the others is attached; if it's among the
   * others, it isn't — whatever the client sent, as a page open since before
   * the split still sends the old album.
   *
   * @throws 404 - a listing that isn't in the catalog
   * @throws 409 ARTIST_AMBIGUOUS; 422 ARTIST_UNREAD, SHOP_NOT_SUPPORTED;
   *   502 SHOP_PAGE_UNREADABLE — the tracked listing's page couldn't be read
   */
  async track(userId: string, input: TrackListingInput): Promise<TrackListingResult> {
    // The tracked listing first: a new record is made from it, and its page
    // is the one read before any other.
    const ids = [
      input.catalogEntryId,
      ...new Set(input.catalogEntryIds.filter((id) => id !== input.catalogEntryId)),
    ];
    const found = await this.prisma.catalogEntry.findMany({ where: { id: { in: ids } } });
    if (found.length !== ids.length) throw new NotFoundException('Catalog entry not found');
    const album = ids.map((id) => found.find((entry) => entry.id === id)!);
    const [chosen] = album;
    const isSplit = await splitsAmong(this.prisma, album);
    const entries = isSplit(chosen) ? [chosen] : album.filter((entry) => !isSplit(entry));

    const tracked = await this.prisma.offer.findMany({
      where: { OR: entries.map(({ supplier, externalId }) => ({ supplier, externalId })) },
      select: { supplier: true, externalId: true, productId: true },
    });
    const holderOf = (entry: (typeof entries)[number]) =>
      tracked.find(
        (offer) => offer.supplier === entry.supplier && offer.externalId === entry.externalId,
      )?.productId;

    const existing = entries.map(holderOf).find((id) => id !== undefined);
    const productId = existing ?? (await this.createFrom(chosen.id, input));

    const skipped: TrackListingResult['skipped'] = [];
    for (const [index, entry] of entries.entries()) {
      // Ours already, or the listing the record was just made from.
      if (holderOf(entry) === productId || (existing === undefined && index === 0)) continue;
      try {
        await this.offers.attach(productId, { catalogEntryId: entry.id });
      } catch (error) {
        const code = offerErrorBodyOf(error)?.code;
        if (code !== 'OFFER_ALREADY_TRACKED' && code !== 'SHOP_PAGE_UNREADABLE') throw error;
        if (entry === chosen && code === 'SHOP_PAGE_UNREADABLE') throw error;
        skipped.push({ catalogEntryId: entry.id, reason: code });
      }
    }

    const offer = await this.prisma.offer.findUnique({
      where: {
        supplier_externalId: { supplier: chosen.supplier, externalId: chosen.externalId },
      },
      select: { id: true, productId: true },
    });
    if (!offer) throw shopPageUnreadable('the listing couldn’t be read');
    await this.prisma.offerWatch.upsert({
      where: { userId_offerId: { userId, offerId: offer.id } },
      create: { userId, offerId: offer.id },
      update: {},
    });

    const product = await findProductWithOffers(this.prisma, offer.productId);
    if (!product) throw new NotFoundException('Product not found');
    return { product, offerId: offer.id, skipped };
  }

  /**
   * Tracks a listing a record holds already — from its comparison, where
   * the album's listings are all there; tracking it again is no error.
   *
   * @throws 404 - no such offer
   */
  async watchOffer(userId: string, offerId: string): Promise<void> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    await this.prisma.offerWatch.upsert({
      where: { userId_offerId: { userId, offerId } },
      create: { userId, offerId },
      update: {},
    });
  }

  /** Stops tracking a listing; tracking it no longer is no error. */
  async untrack(userId: string, offerId: string): Promise<void> {
    await this.prisma.offerWatch.deleteMany({ where: { userId, offerId } });
  }

  /** The user's list, most recently tracked first. */
  async list(userId: string): Promise<WatchedOffer[]> {
    const watches = await this.prisma.offerWatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        offer: {
          select: {
            id: true,
            supplier: true,
            url: true,
            sourceTitle: true,
            imageUrl: true,
            priceCents: true,
            currency: true,
            availability: true,
            product: {
              select: {
                id: true,
                title: true,
                imageUrl: true,
                artist: { select: { name: true } },
                offers: {
                  select: {
                    id: true,
                    supplier: true,
                    priceCents: true,
                    currency: true,
                    availability: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return watches.map(({ createdAt, offer }) => {
      const { product } = offer;
      const [cheapest] = product.offers
        .filter(
          (other) =>
            other.id !== offer.id &&
            isBuyable(other.availability) &&
            other.priceCents < offer.priceCents,
        )
        .sort((a, b) => a.priceCents - b.priceCents);
      return {
        offerId: offer.id,
        productId: product.id,
        title: product.title,
        artist: product.artist.name,
        imageUrl: offer.imageUrl ?? product.imageUrl,
        sourceTitle: offer.sourceTitle,
        supplier: offer.supplier,
        url: offer.url,
        priceCents: offer.priceCents,
        currency: offer.currency,
        availability: offer.availability,
        cheaperElsewhere: cheapest
          ? {
              supplier: cheapest.supplier,
              priceCents: cheapest.priceCents,
              currency: cheapest.currency,
            }
          : null,
        watchedAt: createdAt.toISOString(),
      };
    });
  }

  /**
   * A new record from a listing. Another request may make it first, while
   * this one reads the shop: then that record is the one.
   */
  private async createFrom(catalogEntryId: string, input: TrackListingInput): Promise<string> {
    try {
      const product = await this.fromCatalog.create({
        catalogEntryId,
        artistId: input.artistId,
        artistName: input.artistName,
      });
      return product.id;
    } catch (error) {
      const body = offerErrorBodyOf(error);
      if (body?.code === 'OFFER_ALREADY_TRACKED' && typeof body.productId === 'string') {
        return body.productId;
      }
      throw error;
    }
  }
}
