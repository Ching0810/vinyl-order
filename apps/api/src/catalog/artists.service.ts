import { Injectable, NotFoundException } from '@nestjs/common';
import type { Artist, UpdateArtistInput } from '@vinyl-order/shared';

import { PrismaService } from '../prisma/prisma.service';
import { uniqueByNormalized } from './artist-resolver';
import { normalizeName } from './listing-title';
import { offerUnprocessable } from './offer.errors';
import { toArtistContract } from './product-with-offers.mapper';

/**
 * An artist's names edited by hand (tracker.md §5.7): renamed, names the
 * shops write added — a proposed alias kept — and wrong ones removed.
 */
@Injectable()
export class ArtistsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * In one transaction, removals first, so one request can swap a spelling.
   *
   * @throws 404 - no such artist, or an alias to remove that isn't its
   * @throws 422 ARTIST_NAME_ALIAS - removing the alias that is the name
   */
  async update(id: string, input: UpdateArtistInput): Promise<Artist> {
    return this.prisma.$transaction(async (tx) => {
      const artist = await tx.artist.findUnique({
        where: { id },
        include: { aliases: { select: { id: true, normalized: true } } },
      });
      if (!artist) throw new NotFoundException('Artist not found');

      const removeIds = new Set(input.removeAliasIds ?? []);
      const removing = artist.aliases.filter((alias) => removeIds.has(alias.id));
      if (removing.length !== removeIds.size) throw new NotFoundException('Alias not found');

      const name = input.name ?? artist.name;
      if (removing.some((alias) => alias.normalized === normalizeName(name))) {
        throw offerUnprocessable(
          'ARTIST_NAME_ALIAS',
          'The alias that is the artist’s name can’t be removed.',
        );
      }

      await tx.artistAlias.deleteMany({ where: { id: { in: [...removeIds] } } });
      // The name is always one of the aliases; a known one is skipped.
      await tx.artistAlias.createMany({
        data: uniqueByNormalized([name, ...(input.addAliases ?? [])]).map((alias) => ({
          ...alias,
          artistId: id,
        })),
        skipDuplicates: true,
      });
      if (input.name !== undefined && input.name !== artist.name) {
        await tx.artist.update({ where: { id }, data: { name } });
      }

      const updated = await tx.artist.findUniqueOrThrow({
        where: { id },
        include: { aliases: { orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] } },
      });
      return toArtistContract(updated);
    });
  }
}
