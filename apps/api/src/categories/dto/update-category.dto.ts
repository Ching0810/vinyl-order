import { updateCategorySchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Request body for PATCH /categories/:id (admin) — derived from the shared schema. */
export class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
