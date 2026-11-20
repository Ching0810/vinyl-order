import { http } from '@/lib/core/http';

/**
 * DELETE /admin/offers/:id — a wrong match taken off its record. Admin only.
 * 409 LAST_OFFER for a record's only offer.
 */
export const detachOffer = (offerId: string): Promise<void> =>
  http.delete<void>(`/admin/offers/${offerId}`);
