import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LocalStorageService, StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

/**
 * Provides the StorageService implementation chosen by STORAGE_DRIVER, so
 * callers depend on the interface rather than a specific backend. Exports
 * StorageService so other modules can inject it.
 */
@Module({
  controllers: [UploadsController],
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageService => {
        const driver = config.get<string>('STORAGE_DRIVER') ?? 'local';
        if (driver === 'local') {
          return new LocalStorageService(config);
        }
        throw new Error(`Unsupported STORAGE_DRIVER: ${driver}`);
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
