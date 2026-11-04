import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Connection,
  CreateProductInput,
  PageArgs,
  Product as ProductContract,
  UpdateProductInput,
} from '@vinyl-order/shared';

import { Prisma, type Product } from '../generated/prisma/client';
import { paginate } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Data-access layer for the Product entity. The public storefront reads through
 * paginate/search/findById; admin writes go through create/update/remove
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
   * Cursor-paginated catalog (Relay connection); see common/pagination.
   */
  paginate(args: PageArgs, categorySlug?: string): Promise<Connection<ProductContract>> {
    // `some` reads the join table: keep products having at least one matching
    // category. Absent slug means the whole catalogue.
    const where = categorySlug ? { categories: { some: { slug: categorySlug } } } : {};

    return paginate(
      args,
      (window) => this.prisma.product.findMany({ where, orderBy: this.pageOrder, ...window }),
      (product) => product,
      () => this.prisma.product.count({ where }),
    );
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

  create(data: CreateProductInput): Promise<Product> {
    // categoryIds is a relation, not a column — it has to come out of the
    // spread or Prisma rejects it as an unknown field.
    const { categoryIds, ...fields } = data;

    return this.prisma.product.create({
      data: {
        ...fields,
        ...(categoryIds ? { categories: { connect: categoryIds.map((id) => ({ id })) } } : {}),
      },
    });
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
      return await this.prisma.product.update({
        where: { id },
        data: { ...fields, ...categories },
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
