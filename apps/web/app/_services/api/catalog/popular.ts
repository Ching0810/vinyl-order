import type { PopularListing } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /catalog/popular — what's popular at the shops, by their own lists. Public. */
export const listPopular = (): Promise<PopularListing[]> =>
  http.get<PopularListing[]>('/catalog/popular');
