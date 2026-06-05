import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicUser } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { AuthService, type AuthResponse } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * HTTP boundary for auth.
 * - ZodValidationPipe validates each @Body against its DTO's shared schema;
 *   on failure it throws a 400 automatically.
 * - Thin by design: parse/guard here, delegate all logic to AuthService.
 */
@Controller('auth')
@UsePipes(ZodValidationPipe)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Tighter limit than the global default: blunt mass-signup abuse.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  // Tighter limit than the global default: blunt password brute-forcing.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  // Login doesn't create a resource, so override Nest's default POST 201 -> 200.
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }
}
