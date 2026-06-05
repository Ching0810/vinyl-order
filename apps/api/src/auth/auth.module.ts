import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

/**
 * Auth feature module.
 *
 * - UsersModule    → AuthService / JwtStrategy inject UsersService.
 * - PassportModule → registers the 'jwt' strategy used by JwtAuthGuard.
 * - JwtModule      → configured async from env (ConfigService is global via
 *                    ConfigModule.forRoot), so AuthService can inject JwtService
 *                    to sign tokens. Exported for reuse.
 * - AuthController → /auth routes;  AuthService → business logic (stubbed).
 */
@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // ms-style string ("1d", "15m"); cast to satisfy @nestjs/jwt's
          // StringValue template-literal type, which plain string won't match.
          expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
