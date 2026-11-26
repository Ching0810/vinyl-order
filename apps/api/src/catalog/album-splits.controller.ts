import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AlbumSplitsService } from './album-splits.service';
import { AlbumSplitDto } from './dto/album-split.dto';

/**
 * The admin's corrections to search's albums, for everyone (tracker.md §7.3,
 * §5.9). Admin-only: they change what every member sees.
 */
@Controller('admin/album-splits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@UsePipes(ZodValidationPipe)
export class AlbumSplitsController {
  constructor(private readonly splits: AlbumSplitsService) {}

  /** POST /admin/album-splits — take a listing out of its album. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  split(@Body() dto: AlbumSplitDto): Promise<void> {
    return this.splits.split(dto.catalogEntryId);
  }

  /** DELETE /admin/album-splits/:catalogEntryId — put it back. */
  @Delete(':catalogEntryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  putBack(@Param('catalogEntryId') catalogEntryId: string): Promise<void> {
    return this.splits.putBack(catalogEntryId);
  }
}
