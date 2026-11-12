import { Module } from '@nestjs/common';

import { SupplierOrderImportTokensService } from './import/import-token.service';
import { SupplierOrderImportController } from './import/supplier-order-import.controller';
import { SupplierOrdersController } from './supplier-orders.controller';
import { SupplierOrdersService } from './supplier-orders.service';

/** A user's own orders at the shops. Depends on nothing but Prisma. */
@Module({
  // Order matters: routes register in this order, and the import routes'
  // fixed paths must come before SupplierOrdersController's `:id`.
  controllers: [SupplierOrderImportController, SupplierOrdersController],
  providers: [SupplierOrdersService, SupplierOrderImportTokensService],
})
export class SupplierOrdersModule {}
