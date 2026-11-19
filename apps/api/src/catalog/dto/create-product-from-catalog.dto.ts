import { createProductFromCatalogSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Body for POST /admin/products/from-catalog — derived from the shared schema. */
export class CreateProductFromCatalogDto extends createZodDto(createProductFromCatalogSchema) {}
