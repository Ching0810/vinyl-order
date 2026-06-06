import { createProductSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Request body for POST /products (admin) — derived from the shared schema. */
export class CreateProductDto extends createZodDto(createProductSchema) {}
