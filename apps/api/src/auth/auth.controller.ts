import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { PublicUser } from '@vinyl-order/shared';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';

import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE_MS,
  accessTokenCookieOptions,
} from './auth.cookie';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

/**
 * HTTP boundary for auth.
 * - ZodValidationPipe validates each @Body against its DTO's shared schema.
 * - The JWT is delivered as an httpOnly cookie (never in the JSON body), so the
 *   browser sends it automatically and JS can't read it. Responses return just
 *   the user.
 */
@Controller('auth')
@UsePipes(ZodValidationPipe)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get isProd(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private setAuthCookie(res: Response, token: string): void {
    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      ...accessTokenCookieOptions(this.isProd),
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
    });
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<{ user: PublicUser }> {
    // Register creates the account but does NOT start a session (no cookie) —
    // the client redirects to /login afterward.
    const { user } = await this.auth.register(dto);
    return { user };
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  // Login doesn't create a resource, so override Nest's default POST 201 -> 200.
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: PublicUser }> {
    const { accessToken, user } = await this.auth.login(dto);
    this.setAuthCookie(res, accessToken);
    return { user };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { success: true } {
    // Options must match those used to set the cookie, or the browser won't clear it.
    res.clearCookie(ACCESS_TOKEN_COOKIE, accessTokenCookieOptions(this.isProd));
    return { success: true };
  }

  /**
   * Who is signed in, or nobody.
   *
   * Optionally guarded: the storefront asks this on every page, including for
   * visitors who have never logged in, and "nobody" is an ordinary answer
   * rather than a 401 for the browser to log as a failed request. Routes that
   * genuinely need a session (cart, orders) still use JwtAuthGuard and still
   * answer 401.
   *
   * Wrapped in an object like login and register, so null is a value in a
   * response body rather than an empty one.
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get('me')
  me(@Req() request: Request): { user: PublicUser | null } {
    return { user: (request.user as PublicUser | undefined) ?? null };
  }
}
