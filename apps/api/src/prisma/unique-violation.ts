import { Prisma } from '../generated/prisma/client';

/**
 * The part of a P2002's `meta` that names the violated index. With a driver
 * adapter there is no `meta.target`; @prisma/adapter-pg reports the index
 * Postgres named, under `driverAdapterError.cause.constraint`.
 */
type UniqueViolationMeta = {
  driverAdapterError?: { cause?: { constraint?: { index?: string } } };
};

/**
 * Did this write fail on the named unique index?
 *
 * P2002 is Prisma's unique-constraint violation, and the index it names is
 * checked too — so a clash on some other unique on the same table is not
 * mistaken for the race the caller is handling.
 *
 * The error shape belongs to Prisma and changed once already without anything
 * failing; the orders e2e suite pins it.
 *
 * @param index - the index's name in Postgres, e.g. `Order_userId_idempotencyKey_key`
 */
export const violatesUniqueIndex = (error: unknown, index: string): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const meta = error.meta as UniqueViolationMeta | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index === index;
};
