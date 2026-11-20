import type { TrackListingInput, TrackListingResult } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * POST /watches — track one listing of an album, sending every listing of
 * the album with it so its record holds them all. The record holding any of
 * them is used, or one is made from the listing tracked; the rest are
 * attached, each page read live — seconds, not milliseconds.
 *
 * Refusals carry a code (see offerErrorCode): 409 ARTIST_AMBIGUOUS with the
 * artists to pick from, 422 ARTIST_UNREAD, 502 SHOP_PAGE_UNREADABLE when the
 * tracked listing's page can't be read.
 */
export const trackListing = (input: TrackListingInput): Promise<TrackListingResult> =>
  http.post<TrackListingResult>('/watches', input);
