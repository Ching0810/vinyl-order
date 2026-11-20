import { Controller, Get } from '@nestjs/common';
import type { PopularListing } from '@vinyl-order/shared';

import { PrismaService } from '../prisma/prisma.service';
import { readListingTitle } from './listing-title';
import { taipeiToday } from './supplier-adapter';

/** Listings in the home page's popular section. */
const POPULAR = 12;

/** The catalogs' prices are the shops' own, all in TWD (§4). */
const CATALOG_CURRENCY = 'TWD';

/**
 * What's popular at the shops — what their home pages feature (tracker.md
 * §7.2) — the home page's section when nothing is searched. New vinyl that can be
 * bought or pre-ordered, the shops taken in turn — each one's first, then
 * each one's second — so no shop's picks fill it.
 *
 * From the shops' public pages only, not the records members track: a
 * visitor sees the shops, not what other people follow (§12.1).
 */
@Controller('catalog')
export class PopularController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /catalog/popular — a dozen, the shops' lists interleaved. Public. */
  @Get('popular')
  async popular(): Promise<PopularListing[]> {
    const entries = await this.prisma.catalogEntry.findMany({
      where: {
        popularRank: { not: null },
        isVinyl: true,
        isUsed: false,
        availability: { in: ['in_stock', 'pre_order'] },
        priceCents: { not: null },
      },
      orderBy: [{ popularRank: 'asc' }, { supplier: 'asc' }],
    });
    const today = taipeiToday();

    // A rank among what's shown, per shop: the lists lose what can't be
    // bought, so THT's third shown may be its seventh listed.
    const shown = new Map<string, number>();
    const turns = entries.map((entry) => {
      const turn = (shown.get(entry.supplier) ?? 0) + 1;
      shown.set(entry.supplier, turn);
      return { entry, turn };
    });

    // By turn alone: the sort is stable, so within a turn the order read
    // stands — the higher on its own list first, then the shops' order.
    return turns
      .sort((a, b) => a.turn - b.turn)
      .slice(0, POPULAR)
      .map(({ entry }) => {
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
          rank: entry.popularRank!,
        };
      });
  }
}
