import { trackListingSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/** Body for POST /watches — derived from the shared schema. */
export class TrackListingDto extends createZodDto(trackListingSchema) {}
