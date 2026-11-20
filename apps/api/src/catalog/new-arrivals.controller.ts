import { Controller, Get } from '@nestjs/common';
import type { NewArrival } from '@vinyl-order/shared';

import { PrismaService } from '../prisma/prisma.service';
import { readListingTitle } from './listing-title';
import { taipeiToday } from './supplier-adapter';

/** Listings shown on the home page to someone not signed in. */
const NEW_ARRIVALS = 12;

/** The catalogs' prices are the shops' own, all in TWD (§4). */
const CATALOG_CURRENCY = 'TWD';

/**
 * The shops' new arrivals — what the nightly sync copied lately — for the
 * home page of someone not signed in (tracker.md §12.1). New vinyl that can
 * be bought or pre-ordered, as the list pages last read it.
 *
 * From the shops' public catalogs only, not the records members track: a
 * visitor sees the shops, not what other people follow.
 */
@Controller('catalog')
export class NewArrivalsController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /catalog/new — the newest listings at the shops, a dozen. Public. */
  @Get('new')
  async newArrivals(): Promise<NewArrival[]> {
    const entries = await this.prisma.catalogEntry.findMany({
      where: {
        isVinyl: true,
        isUsed: false,
        availability: { in: ['in_stock', 'pre_order'] },
        priceCents: { not: null },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: NEW_ARRIVALS,
    });
    const today = taipeiToday();

    return entries.map((entry) => {
      const read = readListingTitle(entry.title, today);
      return {
        id: entry.id,
        supplier: entry.supplier,
        url: entry.url,
        title: entry.title,
        imageUrl: entry.imageUrl,
        // Filtered above: a price and a buyable availability.
        priceCents: entry.priceCents!,
        currency: CATALOG_CURRENCY,
        availability: entry.availability === 'pre_order' ? 'pre_order' : 'in_stock',
        searchQuery: [read.artist, read.title].filter(Boolean).join(' ') || entry.title,
        firstSeenAt: entry.createdAt.toISOString(),
      };
    });
  }
}
