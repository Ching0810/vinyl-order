import { Module } from '@nestjs/common';

import { createSupplierAdapters, SUPPLIER_ADAPTERS } from './adapters';
import { ArtistsController } from './artists.controller';
import { ArtistsService } from './artists.service';
import { CatalogProductsController } from './catalog-products.controller';
import { CatalogSearchController } from './catalog-search.controller';
import { CatalogSearchService } from './catalog-search.service';
import { ListingReader } from './listing-reader';
import { OfferCandidatesService } from './offer-candidates.service';
import { OfferRefreshService } from './offer-refresh.service';
import { OffersService } from './offers.service';
import { ProductFromCatalogService } from './product-from-catalog.service';

/**
 * Search over the shops' copied catalogs, records made from them with their
 * offers, and their artists' names. The sync that fills the catalogs isn't here: it runs as a
 * command (sync-cli.ts), not in the API.
 */
@Module({
  controllers: [CatalogSearchController, CatalogProductsController, ArtistsController],
  providers: [
    CatalogSearchService,
    ArtistsService,
    ListingReader,
    ProductFromCatalogService,
    OfferCandidatesService,
    OffersService,
    OfferRefreshService,
    { provide: SUPPLIER_ADAPTERS, useFactory: createSupplierAdapters },
  ],
})
export class CatalogModule {}
