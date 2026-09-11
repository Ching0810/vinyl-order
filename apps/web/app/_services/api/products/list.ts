import type { Connection, PageArgs, Product } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /products — cursor-paginated catalog (Relay connection).
 * Forward paging: `{ first, after }`; backward: `{ last, before }`.
 * Cursors are opaque — echo a previous `endCursor`/`startCursor` back.
 *
 * @param args - page window
 * @param category - optional category slug; omitted means the whole catalogue
 */
export const getProducts = (args: PageArgs = {}, category?: string): Promise<Connection<Product>> =>
  http.get<Connection<Product>>('/products', { ...args, category });
