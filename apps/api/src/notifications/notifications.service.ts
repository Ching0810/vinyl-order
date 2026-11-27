import { Injectable } from '@nestjs/common';
import type {
  Connection,
  Notification as NotificationContract,
  PageArgs,
  UnreadCount,
} from '@vinyl-order/shared';

import { paginate } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Newest first; id breaks ties, which cursor paging needs. */
const newestFirst = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.NotificationOrderByWithRelationInput[];

/** What the page shows of the version a notification is about. */
const withOffer = {
  offer: {
    select: {
      sourceTitle: true,
      supplier: true,
      imageUrl: true,
      product: {
        select: { id: true, title: true, imageUrl: true, artist: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.NotificationInclude;

type NotificationRow = Prisma.NotificationGetPayload<{ include: typeof withOffer }>;

const toContract = ({ offer, ...row }: NotificationRow): NotificationContract => ({
  id: row.id,
  kind: row.kind,
  offerId: row.offerId,
  productId: offer.product.id,
  title: offer.product.title,
  artist: offer.product.artist.name,
  imageUrl: offer.imageUrl ?? offer.product.imageUrl,
  sourceTitle: offer.sourceTitle,
  supplier: offer.supplier,
  fromPriceCents: row.fromPriceCents,
  toPriceCents: row.toPriceCents,
  currency: row.currency,
  createdAt: row.createdAt.toISOString(),
  readAt: row.readAt?.toISOString() ?? null,
});

/**
 * Each user's notifications (tracker.md §5.10): price drops of the versions
 * they track, written when a read of an offer finds them (OfferRefreshService).
 * Every query is scoped by userId, so no one reads another's.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** My notifications, newest first, cursor-paginated. */
  list(userId: string, args: PageArgs): Promise<Connection<NotificationContract>> {
    return paginate(
      args,
      (window) =>
        this.prisma.notification.findMany({
          where: { userId },
          orderBy: newestFirst,
          include: withOffer,
          ...window,
        }),
      toContract,
      () => this.prisma.notification.count({ where: { userId } }),
    );
  }

  /** How many of mine are unread, for the header. */
  async unreadCount(userId: string): Promise<UnreadCount> {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  /** Mark all mine read; those already read keep when they were. */
  async readAll(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
