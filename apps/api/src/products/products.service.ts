import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Connection,
  CreateProductInput,
  PageArgs,
  Product as ProductContract,
  UpdateProductInput,
} from '@vinyl-order/shared';

import { Prisma, type Product } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/** Cursors are opaque to clients — we just base64url the row id. */
const encodeCursor = (id: string): string => Buffer.from(id).toString('base64url');
const decodeCursor = (cursor?: string): string | undefined =>
  cursor ? Buffer.from(cursor, 'base64url').toString('utf8') : undefined;

const clampSize = (n: number | undefined, fallback: number): number => {
  if (n === undefined || !Number.isFinite(n)) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(n)));
};

/**
 * Data-access layer for the Product entity. The public storefront reads through
 * paginate/findHot/search/findById; admin writes go through create/update/remove
 * (wired to admin-guarded routes in the controller).
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
   * Cursor-paginated catalog (Relay connection). Forward with `first`/`after`,
   * backward with `last`/`before`. Fetches one extra row to determine whether a
   * further page exists in the paging direction.
   */
  async paginate(args: PageArgs, categorySlug?: string): Promise<Connection<ProductContract>> {
    const backward = args.last !== undefined || args.before !== undefined;
    // `some` reads the join table: keep products having at least one matching
    // category. Absent slug means the whole catalogue.
    const where = categorySlug ? { categories: { some: { slug: categorySlug } } } : {};

    if (backward) {
      const size = clampSize(args.last, DEFAULT_PAGE_SIZE);
      const beforeId = decodeCursor(args.before);
      const rows = await this.prisma.product.findMany({
        where,
        orderBy: this.pageOrder,
        // Negative take walks backward from the cursor (rows before it).
        take: -(size + 1),
        ...(beforeId ? { cursor: { id: beforeId }, skip: 1 } : {}),
      });
      const hasPreviousPage = rows.length > size;
      // The extra row is at the start when walking backward.
      const pageRows = hasPreviousPage ? rows.slice(rows.length - size) : rows;
      return this.toConnection(pageRows, {
        hasPreviousPage,
        hasNextPage: Boolean(args.before),
      });
    }

    const size = clampSize(args.first, DEFAULT_PAGE_SIZE);
    const afterId = decodeCursor(args.after);
    const rows = await this.prisma.product.findMany({
      where,
      orderBy: this.pageOrder,
      take: size + 1,
      // skip:1 jumps past the cursor row itself.
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > size;
    const pageRows = hasNextPage ? rows.slice(0, size) : rows;
    return this.toConnection(pageRows, {
      hasNextPage,
      hasPreviousPage: Boolean(args.after),
    });
  }

  private toConnection(
    rows: Product[],
    flags: { hasNextPage: boolean; hasPreviousPage: boolean },
  ): Connection<ProductContract> {
    const edges = rows.map((node) => ({ node, cursor: encodeCursor(node.id) }));
    return {
      edges,
      pageInfo: {
        ...flags,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges[edges.length - 1]?.cursor ?? null,
      },
    };
  }

  /** Featured products for the storefront hot section. */
  findHot(): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { isHot: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Products featured in the hero carousel, in display order.
   *
   * Null slideOrder means "not in the carousel". Positions are kept unique and
   * contiguous by placeInCarousel, so the createdAt key is only a backstop
   * against rows written outside the API — without some tie-break, Postgres may
   * return equal rows in any order and the carousel would reshuffle per request.
   */
  findSlides(): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { slideOrder: { not: null } },
      orderBy: [{ slideOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** Search the whole catalog by title or artist (case-insensitive). */
  search(q: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { artist: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * One product, with its categories. Only this read embeds them: list reads
   * would pay for the join on every page to render something the grid doesn't
   * show.
   */
  findById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({
      where: { id },
      include: { categories: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /**
   * Place a product in the carousel at `requested`, or remove it with null,
   * returning the position actually assigned.
   *
   * `slideOrder` is treated as an insertion index rather than a raw value: the
   * gap at the product's old slot is closed and a slot is opened at the target,
   * so positions stay contiguous 0..n-1 and two records can never share one.
   * Enforcing it here rather than with a unique index is deliberate — a partial
   * unique index cannot be deferred in Postgres, so any swap would trip it
   * mid-transaction.
   *
   * Callers must run this inside a transaction: it issues several dependent
   * writes, and a concurrent placement between them would corrupt the sequence.
   */
  private async placeInCarousel(
    tx: Prisma.TransactionClient,
    id: string | null,
    requested: number | null,
  ): Promise<number | null> {
    const from = id
      ? ((await tx.product.findUnique({ where: { id }, select: { slideOrder: true } }))
          ?.slideOrder ?? null)
      : null;

    // Leaving its old slot — close the gap behind it.
    if (from !== null) {
      await tx.product.updateMany({
        where: { slideOrder: { gt: from } },
        data: { slideOrder: { decrement: 1 } },
      });
    }

    if (requested === null) return null;

    // Clamp into the range that exists with this product out of the list, so a
    // wild number from a form lands at the end instead of leaving a hole.
    const others = await tx.product.count({
      where: { slideOrder: { not: null }, ...(id ? { id: { not: id } } : {}) },
    });
    const target = Math.min(Math.max(requested, 0), others);

    // Open the slot.
    await tx.product.updateMany({
      where: { slideOrder: { gte: target }, ...(id ? { id: { not: id } } : {}) },
      data: { slideOrder: { increment: 1 } },
    });

    return target;
  }

  async create(data: CreateProductInput): Promise<Product> {
    // categoryIds is a relation, not a column — it has to come out of the
    // spread or Prisma rejects it as an unknown field.
    const { categoryIds, ...fields } = data;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const slideOrder = await this.placeInCarousel(tx, null, fields.slideOrder ?? null);
        return tx.product.create({
          data: {
            ...fields,
            slideOrder,
            ...(categoryIds ? { categories: { connect: categoryIds.map((id) => ({ id })) } } : {}),
          },
        });
      });
    } catch (error) {
      // P2002 = unique violation; here the discogsReleaseId is already imported.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This Discogs release is already in the catalog');
      }
      throw error;
    }
  }

  async update(id: string, data: UpdateProductInput): Promise<Product> {
    const { categoryIds, ...fields } = data;
    // `set` replaces the whole membership rather than adding to it, so an
    // absent categoryIds must leave the existing assignments alone — sending
    // an empty array is how a caller clears them.
    const categories = categoryIds
      ? { categories: { set: categoryIds.map((id) => ({ id })) } }
      : {};

    try {
      // Only re-sequence when the caller actually addressed the carousel;
      // an ordinary edit must not disturb other records' positions.
      if (!('slideOrder' in data)) {
        return await this.prisma.product.update({
          where: { id },
          data: { ...fields, ...categories },
        });
      }

      return await this.prisma.$transaction(async (tx) => {
        const slideOrder = await this.placeInCarousel(tx, id, fields.slideOrder ?? null);
        return tx.product.update({
          where: { id },
          data: { ...fields, slideOrder, ...categories },
        });
      });
    } catch (error) {
      // P2025 = record to update not found.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
  }
}
