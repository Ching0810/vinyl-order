import type { Connection, PageArgs, Product } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /products — cursor-paginated catalog (Relay connection).
 * Forward paging: `{ first, after }`; backward: `{ last, before }`.
 * Cursors are opaque — echo a previous `endCursor`/`startCursor` back.
 */
export const getProducts = (args: PageArgs = {}): Promise<Connection<Product>> =>
  http.get<Connection<Product>>('/products', args);
