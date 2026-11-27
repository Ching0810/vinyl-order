import { albumSplitSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Request body for POST /admin/album-splits — derived from the shared schema. */
export class AlbumSplitDto extends createZodDto(albumSplitSchema) {}
