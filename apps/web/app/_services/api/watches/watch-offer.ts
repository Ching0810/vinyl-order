import { http } from '@/lib/core/http';

/** PUT /watches/:offerId — track a version a record holds, from its comparison. */
export const watchOffer = (offerId: string): Promise<void> => http.put<void>(`/watches/${offerId}`);

/** DELETE /watches/:offerId — stop tracking a version. */
export const unwatchOffer = (offerId: string): Promise<void> =>
  http.delete<void>(`/watches/${offerId}`);
