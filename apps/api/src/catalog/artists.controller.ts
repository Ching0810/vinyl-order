import { Body, Controller, Param, Patch, UseGuards, UsePipes } from '@nestjs/common';
import type { Artist } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ArtistsService } from './artists.service';
import { UpdateArtistDto } from './dto/update-artist.dto';

/** An artist's names, edited on the product page (tracker.md §5.7, §11). Admin-only. */
@Controller('admin/artists')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@UsePipes(ZodValidationPipe)
export class ArtistsController {
  constructor(private readonly artists: ArtistsService) {}

  /** PATCH /admin/artists/:id — rename; add or remove aliases. */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArtistDto): Promise<Artist> {
    return this.artists.update(id, dto);
  }
}
