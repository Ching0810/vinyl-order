import { Module } from '@nestjs/common';

import { AdminDiscogsController } from './admin-discogs.controller';
import { DiscogsService } from './discogs.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController, AdminDiscogsController],
  providers: [ProductsService, DiscogsService],
})
export class ProductsModule {}
