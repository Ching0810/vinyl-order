import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateProductInput, UpdateProductInput } from '@vinyl-order/shared';

import { Prisma, type Product } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Data-access layer for the Product entity. The public storefront reads through
 * findAll/findById; admin writes go through create/update/remove (wired to
 * admin-guarded routes in the controller).
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catalog listing — newest first. */
  findAll(): Promise<Product[]> {
    return this.prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
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
