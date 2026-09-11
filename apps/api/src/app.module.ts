import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

const NODE_ENV = process.env.NODE_ENV ?? 'development';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Layered env files, most specific wins; missing files are ignored.
      // In production, vars come from the platform (no file) and are still
      // validated below.
      envFilePath: [`.env.${NODE_ENV}.local`, `.env.${NODE_ENV}`, '.env.local', '.env'],
      // Fail fast at boot on missing/invalid env vars.
      validate: validateEnv,
    }),
    // Global rate limit: 100 requests / 60s per client IP. ttl is in ms.
    // In-memory store (per instance) — swap to a Redis store
    // (@nest-lab/throttler-storage-redis) once running >1 instance.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    UsersModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    StorageModule,
    HealthModule,
  ],
  providers: [
    // Apply the throttler to every route by default; tighten per-route with
    // @Throttle, or opt out with @SkipThrottle (see HealthController).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
