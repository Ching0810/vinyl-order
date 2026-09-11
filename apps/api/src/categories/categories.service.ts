import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCategoryInput, UpdateCategoryInput } from '@vinyl-order/shared';

import { Prisma, type Category } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Data access for storefront navigation tabs.
 *
 * Categories are curated rather than derived from Product.genres, so this is
 * a small ordinary CRUD surface: the storefront reads the ordered list to
 * build its tab bar, and admins maintain it.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tab-bar order; name breaks ties so the list never reshuffles per request. */
  private readonly tabOrder: Prisma.CategoryOrderByWithRelationInput[] = [
    { sortOrder: 'asc' },
    { name: 'asc' },
  ];

  /** Tabs in display order, each with the number of products filed under it. */
  async findAll(): Promise<(Category & { productCount: number })[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: this.tabOrder,
      include: { _count: { select: { products: true } } },
    });
    // Flatten Prisma's _count into the shape the shared contract declares.
    return rows.map(({ _count, ...category }) => ({
      ...category,
      productCount: _count.products,
    }));
  }

  findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  async create(data: CreateCategoryInput): Promise<Category> {
    try {
      return await this.prisma.category.create({ data });
    } catch (error) {
      // P2002 = unique violation; here the slug is already taken.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A category with that slug already exists');
      }
      throw error;
    }
  }

  async update(id: string, data: UpdateCategoryInput): Promise<Category> {
    try {
      return await this.prisma.category.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') throw new NotFoundException('Category not found');
        if (error.code === 'P2002') {
          throw new ConflictException('A category with that slug already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Delete a category. Its product assignments go with it — the join rows are
   * ON DELETE CASCADE, and an assignment has no meaning without both ends. The
   * products themselves are untouched.
   */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Category not found');
      }
      throw error;
    }
  }
}
