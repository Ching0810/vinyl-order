import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { AttachOfferResult, CatalogSearchHit, ProductWithOffers } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AttachOfferDto } from './dto/attach-offer.dto';
import { CreateProductFromCatalogDto } from './dto/create-product-from-catalog.dto';
import { OfferCandidatesService } from './offer-candidates.service';
import { OfferRefreshService } from './offer-refresh.service';
import { OffersService } from './offers.service';
import { ProductFromCatalogService } from './product-from-catalog.service';

/**
 * Records made from the shops' listings, and their offers: found at the
 * other shops, attached, detached, read again (tracker.md §7.3, §11).
 * Admin-only. Creating, attaching and refreshing read the shops' pages live,
 * so an answer can take seconds.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@UsePipes(ZodValidationPipe)
export class CatalogProductsController {
  constructor(
    private readonly fromCatalog: ProductFromCatalogService,
    private readonly candidates: OfferCandidatesService,
    private readonly offers: OffersService,
    private readonly refreshes: OfferRefreshService,
  ) {}

  /** POST /admin/products/from-catalog — a record and its first offer, from a listing. */
  @Post('products/from-catalog')
  create(@Body() dto: CreateProductFromCatalogDto): Promise<ProductWithOffers> {
    return this.fromCatalog.create(dto);
  }

  /** GET /admin/products/:id/candidates — the record at the shops it has no offer at yet. */
  @Get('products/:id/candidates')
  findCandidates(@Param('id') id: string): Promise<CatalogSearchHit[]> {
    return this.candidates.candidates(id);
  }

  /** POST /admin/products/:id/offers — a candidate confirmed, or a link pasted. */
  @Post('products/:id/offers')
  attach(@Param('id') id: string, @Body() dto: AttachOfferDto): Promise<AttachOfferResult> {
    return this.offers.attach(id, dto);
  }

  /** POST /admin/products/:id/refresh — each offer read again from its shop. */
  @Post('products/:id/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Param('id') id: string): Promise<ProductWithOffers> {
    return this.refreshes.refresh(id);
  }

  /** DELETE /admin/offers/:id — a wrong match taken off. */
  @Delete('offers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  detach(@Param('id') id: string): Promise<void> {
    return this.offers.detach(id);
  }
}
