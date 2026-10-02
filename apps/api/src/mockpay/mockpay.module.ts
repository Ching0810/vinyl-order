import { Module } from '@nestjs/common';

import { MockPayController } from './mockpay.controller';
import { MockPaySessions } from './mockpay.sessions';

/**
 * MockPay, a fake payment provider for development and tests
 * (docs/design/payments.md §5).
 *
 * It stands in for a third party, so nothing here imports our code or touches
 * our database, and nothing of ours imports it: the API reaches it over HTTP
 * only, exactly as it would a real provider. Mounted outside production only.
 */
@Module({
  controllers: [MockPayController],
  providers: [MockPaySessions],
})
export class MockPayModule {}
