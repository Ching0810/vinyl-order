import { updateArtistSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Body for PATCH /admin/artists/:id — derived from the shared schema. */
export class UpdateArtistDto extends createZodDto(updateArtistSchema) {}
