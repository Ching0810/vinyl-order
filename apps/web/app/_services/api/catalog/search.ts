import type { CatalogAlbum, CatalogSearchQuery } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /catalog/search — the shops' copied catalogs, as albums: each with its
 * listing at every shop that carries it, best first, up to 30. Signed in
 * only. New vinyl unless `used` or `nonVinyl` asks for more; a flag is sent
 * only when on.
 */
export const searchCatalog = ({
  q,
  supplier,
  used,
  nonVinyl,
}: CatalogSearchQuery): Promise<CatalogAlbum[]> =>
  http.get<CatalogAlbum[]>('/catalog/search', {
    q,
    supplier,
    used: used || undefined,
    nonVinyl: nonVinyl || undefined,
  });
