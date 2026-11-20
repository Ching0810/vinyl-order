import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TrackAlbumInput, TrackAlbumResult, WatchedProduct } from '@vinyl-order/shared';

import { PrismaService } from '../prisma/prisma.service';
import { offerErrorBodyOf } from './offer.errors';
import { OffersService } from './offers.service';
import { ProductFromCatalogService } from './product-from-catalog.service';
import { findProductWithOffers } from './product-with-offers.mapper';

/** Availability an offer can be bought at: what "lowest price" counts. */
const BUYABLE = ['in_stock', 'pre_order'] as const;

/**
 * Each user's list of the records they track (tracker.md §5.8), and tracking
 * an album from search: the record found or made, the album's other shops
 * attached, and the record put on the user's list.
 */
@Injectable()
export class WatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fromCatalog: ProductFromCatalogService,
    private readonly offers: OffersService,
  ) {}

  /**
   * An album tracked: its listings, one per shop, best first.
   *
   * The record is the one tracking any of them already, or a new one made
   * from the first. Then each shop the record has no offer at is attached
   * from its listing, read live; a listing another record tracks, or a page
   * that can't be read, is skipped and said so, not a failure — the record
   * and the rest stand. A shop the record has already isn't attached twice:
   * a second listing there is most likely another pressing.
   *
   * @throws 400 - two listings at one shop
   * @throws 404 - a listing that isn't in the catalog
   * @throws 409 ARTIST_AMBIGUOUS; 422 ARTIST_UNREAD, SHOP_NOT_SUPPORTED;
   *   502 SHOP_PAGE_UNREADABLE — only in making a new record
   */
  async track(userId: string, input: TrackAlbumInput): Promise<TrackAlbumResult> {
    const ids = [...new Set(input.catalogEntryIds)];
    const found = await this.prisma.catalogEntry.findMany({ where: { id: { in: ids } } });
    if (found.length !== ids.length) throw new NotFoundException('Catalog entry not found');
    const entries = ids.map((id) => found.find((entry) => entry.id === id)!);
    if (new Set(entries.map((entry) => entry.supplier)).size !== entries.length) {
      throw new BadRequestException('One listing per shop');
    }

    const tracked = await this.prisma.offer.findMany({
      where: { OR: entries.map(({ supplier, externalId }) => ({ supplier, externalId })) },
      select: { supplier: true, externalId: true, productId: true },
    });
    const trackedAs = (entry: (typeof entries)[number]) =>
      tracked.find(
        (offer) => offer.supplier === entry.supplier && offer.externalId === entry.externalId,
      )?.productId;

    const productId =
      entries.map(trackedAs).find((id) => id !== undefined) ??
      (await this.createFrom(entries[0].id, input));

    const skipped: TrackAlbumResult['skipped'] = [];
    const atShops = new Set(
      (await this.prisma.offer.findMany({ where: { productId }, select: { supplier: true } })).map(
        (offer) => offer.supplier,
      ),
    );
    for (const entry of entries) {
      if (atShops.has(entry.supplier)) continue;
      try {
        await this.offers.attach(productId, { catalogEntryId: entry.id });
        atShops.add(entry.supplier);
      } catch (error) {
        const code = offerErrorBodyOf(error)?.code;
        if (code !== 'OFFER_ALREADY_TRACKED' && code !== 'SHOP_PAGE_UNREADABLE') throw error;
        skipped.push({ catalogEntryId: entry.id, reason: code });
      }
    }

    await this.prisma.productWatch.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
    const product = await findProductWithOffers(this.prisma, productId);
    if (!product) throw new NotFoundException('Product not found');
    return { product, skipped };
  }

  /** Stops tracking a record; tracking it no longer is no error. */
  async untrack(userId: string, productId: string): Promise<void> {
    await this.prisma.productWatch.deleteMany({ where: { userId, productId } });
  }

  /** The user's list, most recently tracked first. */
  async list(userId: string): Promise<WatchedProduct[]> {
    const watches = await this.prisma.productWatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        product: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            artist: true,
            artistRef: { select: { name: true } },
            offers: {
              select: { supplier: true, priceCents: true, currency: true, availability: true },
            },
          },
        },
      },
    });

    return watches.map(({ createdAt, product }) => {
      const [lowest] = product.offers
        .filter((offer) => (BUYABLE as readonly string[]).includes(offer.availability))
        .sort((a, b) => a.priceCents - b.priceCents);
      return {
        productId: product.id,
        title: product.title,
        artist: product.artistRef?.name ?? product.artist,
        imageUrl: product.imageUrl,
        lowest: lowest
          ? { supplier: lowest.supplier, priceCents: lowest.priceCents, currency: lowest.currency }
          : null,
        shops: product.offers.length,
        watchedAt: createdAt.toISOString(),
      };
    });
  }

  /**
   * A new record from a listing. Another request may make it first, while
   * this one reads the shop: then that record is the one.
   */
  private async createFrom(catalogEntryId: string, input: TrackAlbumInput): Promise<string> {
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
