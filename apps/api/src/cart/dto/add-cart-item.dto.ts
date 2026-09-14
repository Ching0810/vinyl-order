import { addCartItemSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Request body for POST /cart/items — derived from the shared schema. */
export class AddCartItemDto extends createZodDto(addCartItemSchema) {}
