import { Module } from '@nestjs/common';

import { CatalogSearchController } from './catalog-search.controller';
import { CatalogSearchService } from './catalog-search.service';

/**
 * Search over the shops' copied catalogs. The sync that fills them isn't
 * here: it runs as a command (sync-cli.ts), not in the API.
 */
@Module({
  controllers: [CatalogSearchController],
  providers: [CatalogSearchService],
})
export class CatalogModule {}
