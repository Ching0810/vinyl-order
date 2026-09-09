import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginInput, PublicUser, RegisterInput } from '@vinyl-order/shared';
import * as bcrypt from 'bcrypt';

import { Prisma, type User } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';
import type { JwtPayload } from './jwt.strategy';

/** bcrypt work factor — higher = slower to hash AND slower to brute-force. */
const SALT_ROUNDS = 10;

/**
 * A throwaway hash compared against when no user is found, so login spends
 * roughly the same time whether or not the email exists — otherwise an attacker
 * could detect registered emails by measuring response time.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('no-such-user', SALT_ROUNDS);

/** What auth endpoints return: a signed token plus the safe user shape. */
export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

/**
 * Business logic for auth. Depends on UsersService (persistence) and JwtService
 * (token signing) — it does NOT touch Prisma directly for queries.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterInput): Promise<AuthResponse> {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    try {
      const user = await this.users.create({
        email: dto.email,
        passwordHash,
        name: dto.name,
      });
      return this.issueToken(user);
    } catch (error) {
      // P2002 = unique constraint violation; here it means the email is taken.
      // We translate the persistence-level error into an HTTP-level one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginInput): Promise<AuthResponse> {
    const user = await this.users.findByEmail(dto.email);

    // Always run a compare (against a dummy hash if no user) so timing doesn't
    // reveal whether the email exists.
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    // Same error for "no such user" and "wrong password" — never tell the
    // caller which half failed.
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueToken(user);
  }

  /** Sign a JWT for the user and return it alongside the passwordHash-free shape. */
  private issueToken(user: User): AuthResponse {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }
}
