import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { DiscogsLookupResult } from '@vinyl-order/shared';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DiscogsService } from './discogs.service';

/**
 * Admin-only Discogs lookup — powers the import flow that prefills the product
 * form. Not public: it's an authoring tool and uses the Discogs token quota.
 */
@Controller('admin/discogs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminDiscogsController {
  constructor(private readonly discogs: DiscogsService) {}

  /** GET /admin/discogs/search?q= — search vinyl releases to import. */
  @Get('search')
  search(@Query('q') q?: string): Promise<DiscogsLookupResult[]> {
    return this.discogs.searchVinyl({ q });
  }

  /** GET /admin/discogs/releases/:id — full release, for form prefill. */
  @Get('releases/:id')
  release(@Param('id') id: string): Promise<DiscogsLookupResult> {
    return this.discogs.getRelease(Number(id));
  }
}
