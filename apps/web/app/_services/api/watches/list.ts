import type { WatchedOffer } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /watches — the versions the signed-in user tracks, most recent first. */
export const listWatches = (): Promise<WatchedOffer[]> => http.get<WatchedOffer[]>('/watches');
