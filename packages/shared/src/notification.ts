// Notifications contract shared by apps/web (the header's bell and
// /notifications) and apps/api (docs/design/tracker.md §5.10): a price drop of
// a version the user tracks, told on the site.
import { z } from 'zod';

import { offerSchema } from './offer';

export const notificationKindSchema = z.enum(['price_drop']);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

/** One notification, with what the page shows of the version it is about. */
export const notificationSchema = z.object({
  id: z.uuid(),
  kind: notificationKindSchema,
  offerId: z.uuid(),
  /** The album's record, whose comparison the notification opens. */
  productId: z.uuid(),
  /** The album, as its record names it. */
  title: z.string(),
  artist: z.string(),
  /** The version's own cover, or the record's when it has none. */
  imageUrl: z.url().nullable(),
  /** The version, as its shop names it. */
  sourceTitle: z.string(),
  supplier: offerSchema.shape.supplier,
  /** The price before the drop and after, as read then, in minor units. */
  fromPriceCents: z.number().int(),
  toPriceCents: z.number().int(),
  currency: z.string(),
  /** When the read found the lower price. */
  createdAt: z.iso.datetime(),
  /** Null until the user has seen it. */
  readAt: z.iso.datetime().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

/** GET /notifications/unread-count — for the header's bell. */
export const unreadCountSchema = z.object({ count: z.number().int() });
export type UnreadCount = z.infer<typeof unreadCountSchema>;
