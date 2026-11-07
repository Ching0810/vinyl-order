import { Module } from '@nestjs/common';

import { SupplierOrdersController } from './supplier-orders.controller';
import { SupplierOrdersService } from './supplier-orders.service';

/** A user's own orders at the shops. Depends on nothing but Prisma. */
@Module({
  controllers: [SupplierOrdersController],
  providers: [SupplierOrdersService],
})
export class SupplierOrdersModule {}
