import { createSupplierOrderSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Request body for POST /supplier-orders — derived from the shared schema. */
export class CreateSupplierOrderDto extends createZodDto(createSupplierOrderSchema) {}
