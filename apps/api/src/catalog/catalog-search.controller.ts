import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
import type { CatalogAlbum, PublicUser } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CatalogSearchService } from './catalog-search.service';
import { CatalogSearchQueryDto } from './dto/catalog-search-query.dto';

/**
 * The shops' copied catalogs, searched by album to track one (tracker.md
 * §7.3, §11, §12.1). Anyone signed in: tracking is everyone's own.
 */
@Controller('catalog')
@UseGuards(JwtAuthGuard)
@UsePipes(ZodValidationPipe)
export class CatalogSearchController {
  constructor(private readonly catalog: CatalogSearchService) {}

  /** GET /catalog/search?q=&supplier=&used=&nonVinyl= — albums, best first, up to 30. */
  @Get('search')
  search(
    @CurrentUser() user: PublicUser,
    @Query() query: CatalogSearchQueryDto,
  ): Promise<CatalogAlbum[]> {
    return this.catalog.search(query, user.id);
  }
}
