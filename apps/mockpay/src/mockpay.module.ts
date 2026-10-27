import { Module } from '@nestjs/common';

import { MockPayController } from './mockpay.controller';
import { MockPayPrisma } from './mockpay.prisma';
import { MockPaySessions } from './mockpay.sessions';
import { MockPayWebhooks } from './mockpay.webhooks';

/**
 * MockPay, a fake payment provider for development and tests
 * (docs/design/payments.md §5).
 *
 * It stands in for a third party, so it is a package of its own: it can't
 * import our code, and it never touches our database. The API only mounts it
 * — outside production, or with PAYMENT_DEMO=true — and otherwise reaches it
 * over HTTP, exactly as it would a real provider.
 */
@Module({
  controllers: [MockPayController],
  providers: [MockPayPrisma, MockPaySessions, MockPayWebhooks],
})
export class MockPayModule {}
