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
import { PopularController } from './popular.controller';
import { OffersService } from './offers.service';
import { ProductFromCatalogService } from './product-from-catalog.service';
import { ProductOffersController } from './product-offers.controller';

import { WatchesController } from './watches.controller';
import { WatchesService } from './watches.service';

/**
 * Search over the shops' copied catalogs, records made from them with their
 * offers and their artists' names, and each user's tracked records. The sync that fills the catalogs isn't here: it runs as a
 * command (sync-cli.ts), not in the API.
 */
@Module({
  controllers: [
    CatalogSearchController,
    CatalogProductsController,
    ArtistsController,
    WatchesController,
    ProductOffersController,
    PopularController,
  ],
  providers: [
    CatalogSearchService,
    ArtistsService,
    ListingReader,
    ProductFromCatalogService,
    OfferCandidatesService,
    OffersService,
    OfferRefreshService,
    WatchesService,
    { provide: SUPPLIER_ADAPTERS, useFactory: createSupplierAdapters },
  ],
})
export class CatalogModule {}
