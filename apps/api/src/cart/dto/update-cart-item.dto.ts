import { updateCartItemSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Request body for PATCH /cart/items/:productId — derived from the shared schema. */
export class UpdateCartItemDto extends createZodDto(updateCartItemSchema) {}
