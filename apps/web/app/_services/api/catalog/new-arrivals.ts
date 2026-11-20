import type { NewArrival } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /catalog/new — the shops' newest listings that can be bought. Public. */
export const listNewArrivals = (): Promise<NewArrival[]> => http.get<NewArrival[]>('/catalog/new');
