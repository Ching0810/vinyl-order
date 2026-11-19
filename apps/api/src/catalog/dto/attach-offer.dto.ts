import { attachOfferSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Body for POST /admin/products/:id/offers — derived from the shared schema. */
export class AttachOfferDto extends createZodDto(attachOfferSchema) {}
