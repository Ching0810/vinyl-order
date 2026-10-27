import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

/**
 * MockPay's connection to its own database (docs/design/deploy.md §6.5).
 *
 * Its own client, generated from its own schema, on its own URL: nothing here
 * can read the API's tables, and the module doesn't export it, so the API
 * can't read MockPay's either.
 */
@Injectable()
export class MockPayPrisma extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MockPayPrisma.name);

  constructor(config: ConfigService) {
    // Required here rather than in the API's env schema: it is needed only
    // while MockPay is mounted, so a production deploy without the demo goes
    // without.
    const url = config.get<string>('MOCKPAY_DATABASE_URL');
    if (!url) {
      throw new Error(
        'MOCKPAY_DATABASE_URL is required while MockPay is mounted: it keeps its sessions in a database of its own.',
      );
    }
    super({ adapter: new PrismaPg({ connectionString: url }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Connected to MockPay's database");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
