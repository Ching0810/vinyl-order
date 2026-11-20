import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { PublicUser, TrackAlbumResult, WatchedProduct } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TrackAlbumDto } from './dto/track-album.dto';
import { WatchesService } from './watches.service';

/**
 * The signed-in user's tracked records (tracker.md §5.8, §11). Everyone's
 * own: no one sees another's list.
 */
@Controller('watches')
@UseGuards(JwtAuthGuard)
@UsePipes(ZodValidationPipe)
export class WatchesController {
  constructor(private readonly watches: WatchesService) {}

  /** GET /watches — my tracked records, most recent first. */
  @Get()
  list(@CurrentUser() user: PublicUser): Promise<WatchedProduct[]> {
    return this.watches.list(user.id);
  }

  /** POST /watches — track an album from search; it reads shops' pages live. */
  @Post()
  track(@CurrentUser() user: PublicUser, @Body() dto: TrackAlbumDto): Promise<TrackAlbumResult> {
    return this.watches.track(user.id, dto);
  }

  /** DELETE /watches/:productId — stop tracking a record. */
  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  untrack(@CurrentUser() user: PublicUser, @Param('productId') productId: string): Promise<void> {
    return this.watches.untrack(user.id, productId);
  }
}
