import { Injectable } from '@nestjs/common';

import type { User } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Data-access layer for the User entity (persistence only — no business logic).
 * Business rules (hashing, JWT, etc.) live in AuthService, which calls into this.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }
  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
  create(data: { email: string; passwordHash: string; name?: string }): Promise<User> {
    return this.prisma.user.create({ data });
  }
}
