import type { DiscogsLookupResult } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /admin/discogs/search?q= — admin-only; vinyl releases to import. */
export const searchDiscogs = (q: string): Promise<DiscogsLookupResult[]> =>
  http.get<DiscogsLookupResult[]>('/admin/discogs/search', { q });

/** GET /admin/discogs/releases/:id — admin-only; full release for form prefill. */
export const getDiscogsRelease = (id: number): Promise<DiscogsLookupResult> =>
  http.get<DiscogsLookupResult>(`/admin/discogs/releases/${id}`);
