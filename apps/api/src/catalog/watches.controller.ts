import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { PublicUser, TrackListingResult, WatchedOffer } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TrackListingDto } from './dto/track-listing.dto';
import { WatchesService } from './watches.service';

/**
 * The signed-in user's tracked listings — the versions they follow, each at
 * one shop (tracker.md §5.8, §11). Everyone's own: no one sees another's.
 */
@Controller('watches')
@UseGuards(JwtAuthGuard)
@UsePipes(ZodValidationPipe)
export class WatchesController {
  constructor(private readonly watches: WatchesService) {}

  /** GET /watches — my tracked listings, most recent first. */
  @Get()
  list(@CurrentUser() user: PublicUser): Promise<WatchedOffer[]> {
    return this.watches.list(user.id);
  }

  /** POST /watches — track a listing from search; it reads shops' pages live. */
  @Post()
  track(
    @CurrentUser() user: PublicUser,
    @Body() dto: TrackListingDto,
  ): Promise<TrackListingResult> {
    return this.watches.track(user.id, dto);
  }

  /** PUT /watches/:offerId — track a listing a record holds, from its comparison. */
  @Put(':offerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  watch(@CurrentUser() user: PublicUser, @Param('offerId') offerId: string): Promise<void> {
    return this.watches.watchOffer(user.id, offerId);
  }

  /** DELETE /watches/:offerId — stop tracking a listing. */
  @Delete(':offerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  untrack(@CurrentUser() user: PublicUser, @Param('offerId') offerId: string): Promise<void> {
    return this.watches.untrack(user.id, offerId);
  }
}
