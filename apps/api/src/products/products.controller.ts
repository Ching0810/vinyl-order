import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Product } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

/**
 * Vinyl catalog. Reads are public; writes are admin-only (JwtAuthGuard verifies
 * the session, RolesGuard checks role === 'admin'). ZodValidationPipe validates
 * write bodies against the shared schemas (no-op on the param-only read routes).
 */
@Controller('products')
@UsePipes(ZodValidationPipe)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /** GET /products — list products, newest first. Public. */
  @Get()
  list(): Promise<Product[]> {
    return this.products.findAll();
  }

  /** GET /products/:id — a single product, 404 if not found. Public. */
  @Get(':id')
  async detail(@Param('id') id: string): Promise<Product> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  // ---- Admin-only write routes ----

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  create(@Body() dto: CreateProductDto): Promise<Product> {
    return this.products.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto): Promise<Product> {
    return this.products.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.products.remove(id);
  }
}
