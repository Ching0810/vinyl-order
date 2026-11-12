import { importSupplierOrderEmailSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Request body for POST /supplier-orders/import — derived from the shared schema. */
export class ImportSupplierOrderEmailDto extends createZodDto(importSupplierOrderEmailSchema) {}
