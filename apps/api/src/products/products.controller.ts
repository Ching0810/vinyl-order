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
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Connection, Product } from '@vinyl-order/shared';
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

  /**
   * GET /products — cursor-paginated catalog (Relay connection). Public.
   * Forward: `?first=&after=`; backward: `?last=&before=`. Defaults to first 10.
   */
  @Get()
  list(
    @Query('first') first?: string,
    @Query('after') after?: string,
    @Query('last') last?: string,
    @Query('before') before?: string,
  ): Promise<Connection<Product>> {
    return this.products.paginate({
      first: first === undefined ? undefined : Number(first),
      after,
      last: last === undefined ? undefined : Number(last),
      before,
    });
  }

  /** GET /products/hot — featured products for the storefront hot section. Public. */
  @Get('hot')
  hot(): Promise<Product[]> {
    return this.products.findHot();
  }

  /**
   * GET /products/slides — products featured in the hero carousel. Public.
   * Declared above `:id` so the literal path wins the route match.
   */
  @Get('slides')
  slides(): Promise<Product[]> {
    return this.products.findSlides();
  }

  /** GET /products/search?q= — search the catalog by title/artist. Public. */
  @Get('search')
  search(@Query('q') q?: string): Promise<Product[]> {
    // Empty query → no results (avoids returning the whole catalog by accident).
    return q && q.trim() ? this.products.search(q.trim()) : Promise.resolve([]);
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
