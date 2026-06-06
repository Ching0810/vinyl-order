import { updateProductSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Request body for PATCH /products/:id (admin) — all fields optional. */
export class UpdateProductDto extends createZodDto(updateProductSchema) {}
