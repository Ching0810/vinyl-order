import { createCategorySchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Request body for POST /categories (admin) — derived from the shared schema. */
export class CreateCategoryDto extends createZodDto(createCategorySchema) {}
