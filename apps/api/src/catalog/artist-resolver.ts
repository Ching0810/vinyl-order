import { NotFoundException } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { normalizeName } from './listing-title';
import { offerConflict, offerUnprocessable } from './offer.errors';

export interface ArtistChoice {
  /** The artist the user picked, when the names belonged to more than one. */
  artistId?: string;
  /** The name the user gave, when the title gave none. */
  artistName?: string;
}

/**
 * The artist a new record is by, from the names a shop wrote (tracker.md
 * §5.7): an artist that already owns one of the names, or a new one with
 * them all. Names the artist doesn't have yet become its aliases, so the
 * next shop's spelling is known.
 *
 * Runs inside the caller's transaction, so a record never ends up without
 * its artist, or an artist with names added for a record that failed.
 *
 * @throws 422 ARTIST_UNREAD - no names, and none given
 * @throws 409 ARTIST_AMBIGUOUS - the names belong to more than one artist
 * @throws 404 - `artistId` names no artist
 */
export const resolveArtist = async (
  tx: Prisma.TransactionClient,
  readNames: string[],
  choice: ArtistChoice,
): Promise<{ id: string; name: string }> => {
  const names = uniqueByNormalized(choice.artistName ? [choice.artistName] : readNames);
  if (names.length === 0) {
    throw offerUnprocessable('ARTIST_UNREAD', 'No artist could be read from the title.');
  }

  const artist = choice.artistId
    ? await tx.artist.findUnique({ where: { id: choice.artistId } })
    : await ownerOf(tx, names);
  if (choice.artistId && !artist) throw new NotFoundException('Artist not found');

  if (!artist) {
    return tx.artist.create({
      data: { name: names[0].name, aliases: { create: names } },
      select: { id: true, name: true },
    });
  }
  // Already known names are skipped by the unique (artistId, normalized).
  await tx.artistAlias.createMany({
    data: names.map((name) => ({ ...name, artistId: artist.id })),
    skipDuplicates: true,
  });
  return { id: artist.id, name: artist.name };
};

/** The one artist owning any of the names, if any; two or more is a 409. */
const ownerOf = async (tx: Prisma.TransactionClient, names: AliasName[]) => {
  const owners = await tx.artist.findMany({
    where: { aliases: { some: { normalized: { in: names.map((name) => name.normalized) } } } },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  if (owners.length > 1) {
    throw offerConflict('ARTIST_AMBIGUOUS', 'These names belong to more than one artist.', {
      artists: owners,
    });
  }
  return owners[0] ?? null;
};

type AliasName = { name: string; normalized: string };

/** Each name once by its search form, in the order written; empty ones out. */
const uniqueByNormalized = (names: string[]): AliasName[] => {
  const seen = new Set<string>();
  const result: AliasName[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const normalized = normalizeName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ name, normalized });
  }
  return result;
};
