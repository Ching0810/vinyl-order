import { Module } from '@nestjs/common';

import { UsersService } from './users.service';

/**
 * Exports UsersService so other modules (e.g. AuthModule) can depend on it.
 * PrismaService is available via the @Global() PrismaModule, so it isn't imported here.
 */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
