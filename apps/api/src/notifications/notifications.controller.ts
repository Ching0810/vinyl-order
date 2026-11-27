import { Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import type { Connection, Notification, PublicUser, UnreadCount } from '@vinyl-order/shared';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { toPageArgs } from '../common/pagination';
import { NotificationsService } from './notifications.service';

/**
 * The signed-in user's notifications (tracker.md §5.10, §11): price drops of
 * what they track. Everyone's own.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * GET /notifications — mine, newest first. Forward: `?first=&after=`;
   * backward: `?last=&before=`. Defaults to the first 10.
   */
  @Get()
  list(
    @CurrentUser() user: PublicUser,
    @Query('first') first?: string,
    @Query('after') after?: string,
    @Query('last') last?: string,
    @Query('before') before?: string,
  ): Promise<Connection<Notification>> {
    return this.notifications.list(user.id, toPageArgs({ first, after, last, before }));
  }

  /** GET /notifications/unread-count — how many I haven't read. */
  @Get('unread-count')
  unreadCount(@CurrentUser() user: PublicUser): Promise<UnreadCount> {
    return this.notifications.unreadCount(user.id);
  }

  /** POST /notifications/read — mark all mine read. */
  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  readAll(@CurrentUser() user: PublicUser): Promise<void> {
    return this.notifications.readAll(user.id);
  }
}
