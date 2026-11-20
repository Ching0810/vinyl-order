import { trackAlbumSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Body for POST /watches — derived from the shared schema. */
export class TrackAlbumDto extends createZodDto(trackAlbumSchema) {}
