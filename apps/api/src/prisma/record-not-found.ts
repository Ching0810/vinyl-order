import { Prisma } from '../generated/prisma/client';

/**
 * Did this write fail because the row it targets doesn't exist?
 *
 * P2025 is what Prisma raises when an `update` or `delete` by a unique key
 * matches no row. Callers turn it into their own 404, worded for what was
 * missing — the code alone doesn't say which record that was.
 */
export const isRecordNotFound = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
