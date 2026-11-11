import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCategoryInput, UpdateCategoryInput } from '@vinyl-order/shared';

import type { Category, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isRecordNotFound } from '../prisma/record-not-found';
import { violatesUniqueIndex } from '../prisma/unique-violation';

/** The index that makes a reused slug a 409 (schema.prisma). */
const SLUG_INDEX = 'Category_slug_key';

const slugTaken = (): ConflictException =>
  new ConflictException('A category with that slug already exists');

/**
 * Data access for storefront navigation tabs.
 *
 * Categories are curated rather than derived from the records, so this is a
 * small ordinary CRUD surface: the storefront reads the ordered list to
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
      if (violatesUniqueIndex(error, SLUG_INDEX)) throw slugTaken();
      throw error;
    }
  }

  async update(id: string, data: UpdateCategoryInput): Promise<Category> {
    try {
      return await this.prisma.category.update({ where: { id }, data });
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('Category not found');
      if (violatesUniqueIndex(error, SLUG_INDEX)) throw slugTaken();
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
      if (isRecordNotFound(error)) throw new NotFoundException('Category not found');
      throw error;
    }
  }
}
