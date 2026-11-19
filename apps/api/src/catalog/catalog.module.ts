import { Module } from '@nestjs/common';

import { createSupplierAdapters, SUPPLIER_ADAPTERS } from './adapters';
import { CatalogProductsController } from './catalog-products.controller';
import { CatalogSearchController } from './catalog-search.controller';
import { CatalogSearchService } from './catalog-search.service';
import { OfferRefreshService } from './offer-refresh.service';
import { ProductFromCatalogService } from './product-from-catalog.service';

/**
 * Search over the shops' copied catalogs, and records made from them with
 * their offers. The sync that fills the catalogs isn't here: it runs as a
 * command (sync-cli.ts), not in the API.
 */
@Module({
  controllers: [CatalogSearchController, CatalogProductsController],
  providers: [
    CatalogSearchService,
    ProductFromCatalogService,
    OfferRefreshService,
    { provide: SUPPLIER_ADAPTERS, useFactory: createSupplierAdapters },
  ],
})
export class CatalogModule {}
