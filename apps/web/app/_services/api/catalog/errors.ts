import { type OfferErrorCode, offerErrorCodeSchema } from '@vinyl-order/shared';
import { z } from 'zod';

import { HttpError } from '@/lib/core/http';

const bodyOf = (error: unknown): Record<string, unknown> | null =>
  error instanceof HttpError && typeof error.body === 'object'
    ? (error.body as Record<string, unknown> | null)
    : null;

/**
 * The code a refusal to track an album carries, or undefined for any other
 * error — a network failure, a 400, a code this page doesn't know. Parsed
 * with the shared schema, so a typo can't match.
 */
export const offerErrorCode = (error: unknown): OfferErrorCode | undefined =>
  offerErrorCodeSchema.safeParse(bodyOf(error)?.code).data;

const artistChoicesSchema = z.array(z.object({ id: z.uuid(), name: z.string() }));

/** The artists an ARTIST_AMBIGUOUS says own the names, or an empty list. */
export const ambiguousArtistsOf = (error: unknown): { id: string; name: string }[] =>
  offerErrorCode(error) === 'ARTIST_AMBIGUOUS'
    ? (artistChoicesSchema.safeParse(bodyOf(error)?.artists).data ?? [])
    : [];
