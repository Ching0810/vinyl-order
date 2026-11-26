import { http } from '@/lib/core/http';

/** POST /admin/album-splits — take a listing out of its album, for everyone. Admin only. */
export const splitListing = (catalogEntryId: string): Promise<void> =>
  http.post<void>('/admin/album-splits', { catalogEntryId });

/** DELETE /admin/album-splits/:catalogEntryId — put a split listing back. Admin only. */
export const putBackListing = (catalogEntryId: string): Promise<void> =>
  http.delete<void>(`/admin/album-splits/${catalogEntryId}`);
