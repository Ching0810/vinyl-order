import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { ProductWithOffers } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateProductFromCatalogDto } from './dto/create-product-from-catalog.dto';
import { OfferRefreshService } from './offer-refresh.service';
import { ProductFromCatalogService } from './product-from-catalog.service';

/**
 * Records made from the shops' listings, and their offers read again
 * (tracker.md §7.3, §11). Admin-only. Both read the shops' pages live, so
 * an answer can take seconds.
 */
@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@UsePipes(ZodValidationPipe)
export class CatalogProductsController {
  constructor(
    private readonly fromCatalog: ProductFromCatalogService,
    private readonly offers: OfferRefreshService,
  ) {}

  /** POST /admin/products/from-catalog — a record and its first offer, from a listing. */
  @Post('from-catalog')
  create(@Body() dto: CreateProductFromCatalogDto): Promise<ProductWithOffers> {
    return this.fromCatalog.create(dto);
  }

  /** POST /admin/products/:id/refresh — each offer read again from its shop. */
  @Post(':id/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Param('id') id: string): Promise<ProductWithOffers> {
    return this.offers.refresh(id);
  }
}
