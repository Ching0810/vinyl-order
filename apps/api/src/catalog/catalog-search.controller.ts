import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
import type { CatalogSearchHit } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogSearchService } from './catalog-search.service';
import { CatalogSearchQueryDto } from './dto/catalog-search-query.dto';

/**
 * The shops' copied catalogs, searched to add a record (tracker.md §7.3,
 * §11). Admin-only: a hit is a shop's listing, not yet a product.
 */
@Controller('admin/catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@UsePipes(ZodValidationPipe)
export class CatalogSearchController {
  constructor(private readonly catalog: CatalogSearchService) {}

  /** GET /admin/catalog/search?q=&supplier=&used=&nonVinyl= — best first, up to 30. */
  @Get('search')
  search(@Query() query: CatalogSearchQueryDto): Promise<CatalogSearchHit[]> {
    return this.catalog.search(query);
  }
}
