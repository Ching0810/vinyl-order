import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type {
  CreatedSupplierOrderImportToken,
  SupplierOrderImportToken,
} from '@vinyl-order/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { isRecordNotFound } from '../../prisma/record-not-found';

/**
 * Marks a string as this site's import token, so a person or a secret
 * scanner recognises one pasted where it shouldn't be.
 */
const PREFIX = 'vo_imp_';

/** The prefix, then 32 random bytes as base64url (43 characters). */
const TOKEN_FORMAT = /^vo_imp_[A-Za-z0-9_-]{43}$/;

/**
 * What is stored: the token's SHA-256, as hex. A fast hash is enough — the
 * token is 256 random bits, so unlike a password there is nothing to guess
 * a hash back from (tracker.md §9.4).
 */
const hashOf = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * The import tokens behind email import (tracker.md §9.4): one per user, made
 * and revoked from the supplier orders page, used by the user's Apps Script.
 * It can do nothing but import into its user's own orders.
 */
@Injectable()
export class SupplierOrderImportTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's token as the page shows it, or null if they have none. */
  async find(userId: string): Promise<SupplierOrderImportToken | null> {
    const row = await this.prisma.supplierOrderImportToken.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    };
  }

  /**
   * A new token for the user, replacing any they had — so the old one stops
   * working at once. The token itself is returned here and never again.
   */
  async create(userId: string): Promise<CreatedSupplierOrderImportToken> {
    const token = PREFIX + randomBytes(32).toString('base64url');
    const tokenHash = hashOf(token);
    // Replacing is resetting: a new token has not been used yet.
    const row = await this.prisma.supplierOrderImportToken.upsert({
      where: { userId },
      create: { userId, tokenHash },
      update: { tokenHash, createdAt: new Date(), lastUsedAt: null },
    });
    return { token, createdAt: row.createdAt.toISOString(), lastUsedAt: null };
  }

  /** Revoke the user's token. Having none already is the same outcome. */
  async remove(userId: string): Promise<void> {
    await this.prisma.supplierOrderImportToken.deleteMany({ where: { userId } });
  }

  /**
   * Whose token this is, recording that it was used — or null for one that
   * isn't a current token. One query: the lookup is the update.
   *
   * Looked up by its hash through the unique index, so there is no
   * comparison of secrets in this process to time; and a malformed string is
   * turned away before it reaches the database.
   *
   * @param token - as sent in the Authorization header
   */
  async userIdFor(token: string): Promise<string | null> {
    if (!TOKEN_FORMAT.test(token)) return null;
    try {
      const row = await this.prisma.supplierOrderImportToken.update({
        where: { tokenHash: hashOf(token) },
        data: { lastUsedAt: new Date() },
        select: { userId: true },
      });
      return row.userId;
    } catch (error) {
      if (isRecordNotFound(error)) return null;
      throw error;
    }
  }
}
