import { catalogSearchQuerySchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Query for GET /admin/catalog/search — derived from the shared schema. */
export class CatalogSearchQueryDto extends createZodDto(catalogSearchQuerySchema) {}
