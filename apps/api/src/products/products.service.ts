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
  async paginate(args: PageArgs): Promise<Connection<ProductContract>> {
    const backward = args.last !== undefined || args.before !== undefined;

    if (backward) {
      const size = clampSize(args.last, DEFAULT_PAGE_SIZE);
      const beforeId = decodeCursor(args.before);
      const rows = await this.prisma.product.findMany({
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

  findById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }

  async create(data: CreateProductInput): Promise<Product> {
    try {
      return await this.prisma.product.create({ data });
    } catch (error) {
      // P2002 = unique violation; here the discogsReleaseId is already imported.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This Discogs release is already in the catalog');
      }
      throw error;
    }
  }

  async update(id: string, data: UpdateProductInput): Promise<Product> {
    try {
      return await this.prisma.product.update({ where: { id }, data });
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
