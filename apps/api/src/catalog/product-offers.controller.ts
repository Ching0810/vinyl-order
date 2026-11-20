import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ProductWithOffers } from '@vinyl-order/shared';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OfferRefreshService } from './offer-refresh.service';
import { findProductWithOffers } from './product-with-offers.mapper';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A record's comparison (tracker.md §11, §12.3): every version at every
 * shop. Anyone reads it — the shops' prices are public; anyone signed in
 * reads it again from the shops, a record at most every ten minutes.
 */
@Controller('products')
export class ProductOffersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshes: OfferRefreshService,
  ) {}

  /** GET /products/:id/offers — the record and its offers; 404 for one not tracked. */
  @Get(':id/offers')
  async offers(@Param('id') id: string): Promise<ProductWithOffers> {
    const product = await findProductWithOffers(this.prisma, id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** POST /products/:id/refresh — each offer read again; 429 within ten minutes of the last. */
  @Post(':id/refresh')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  refresh(@Param('id') id: string): Promise<ProductWithOffers> {
    return this.refreshes.refresh(id, { minInterval: MEMBER_REFRESH_INTERVAL });
  }
}

/** How often members may read a record again: the shops are read once a while. */
const MEMBER_REFRESH_INTERVAL = 10 * 60 * 1000;
