import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BUYABLE_AVAILABILITY,
  type Connection,
  type PageArgs,
  type Product as ProductContract,
  type UpdateProductInput,
} from '@vinyl-order/shared';

import { CATALOG_CURRENCY } from '../catalog/catalog-currency';
import type { Prisma } from '../generated/prisma/client';
import { paginate } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { isRecordNotFound } from '../prisma/record-not-found';

/**
 * What a product read joins: its artist's name, and its offers that can be
 * ordered, cheapest first — the first is its "from NT$…" (tracker.md §8).
 */
const withCard = {
  artist: { select: { name: true } },
  offers: {
    where: { availability: { in: [...BUYABLE_AVAILABILITY] } },
    select: { priceCents: true, currency: true },
    orderBy: { priceCents: 'asc' },
    take: 1,
  },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof withCard }>;

/** Shape a product row for the wire. */
const toContract = (product: ProductRow): ProductContract => {
  const [cheapest] = product.offers;
  return {
    id: product.id,
    title: product.title,
    artist: product.artist.name,
    // A `@db.Date` reads back as midnight UTC: the day is its first ten characters.
    releaseDate: product.releaseDate ? product.releaseDate.toISOString().slice(0, 10) : null,
    format: product.format,
    edition: product.edition,
    imageUrl: product.imageUrl,
    fromPriceCents: cheapest?.priceCents ?? null,
    currency: cheapest?.currency ?? CATALOG_CURRENCY,
  };
};

/**
 * Data-access layer for the Product entity. The public storefront reads through
 * paginate/findById; admin writes go through update/remove (wired to
 * admin-guarded routes in the controller). Records are made from a shop's
 * listing (catalog/), never here.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Stable, fully-deterministic order is required for cursor paging — createdAt
  // can tie, so id breaks ties. The cursor anchors on id (unique).
  private readonly pageOrder: Prisma.ProductOrderByWithRelationInput[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];

  /**
   * Cursor-paginated catalog (Relay connection); see common/pagination.
   */
  paginate(args: PageArgs): Promise<Connection<ProductContract>> {
    return paginate(
      args,
      (window) =>
        this.prisma.product.findMany({
          orderBy: this.pageOrder,
          include: withCard,
          ...window,
        }),
      toContract,
      () => this.prisma.product.count(),
    );
  }

  async findById(id: string): Promise<ProductContract | null> {
    const product = await this.prisma.product.findUnique({ where: { id }, include: withCard });
    return product ? toContract(product) : null;
  }

  async update(id: string, data: UpdateProductInput): Promise<ProductContract> {
    const { releaseDate, ...fields } = data;

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          ...fields,
          // Absent leaves it alone; null clears it. A `@db.Date` takes
          // midnight UTC, so the day stays the one written.
          ...(releaseDate === undefined
            ? {}
            : { releaseDate: releaseDate ? new Date(`${releaseDate}T00:00:00Z`) : null }),
        },
        include: withCard,
      });
      return toContract(product);
    } catch (error) {
      // P2025 = record to update not found.
      if (isRecordNotFound(error)) throw new NotFoundException('Product not found');
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('Product not found');
      throw error;
    }
  }
}
