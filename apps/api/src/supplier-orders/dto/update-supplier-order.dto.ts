import { updateSupplierOrderSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Request body for PATCH /supplier-orders/:id — derived from the shared schema. */
export class UpdateSupplierOrderDto extends createZodDto(updateSupplierOrderSchema) {}
