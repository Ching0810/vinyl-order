import { Module, ServiceUnavailableException } from '@nestjs/common';

import { PaymentProvider, PaymentSession } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * Temporary: stands in until MockPayProvider replaces it, so the API boots and
 * PaymentsService can be built. Starting a payment answers 503 until then.
 */
class UnconfiguredPaymentProvider extends PaymentProvider {
  createSession(): Promise<PaymentSession> {
    throw new ServiceUnavailableException('Payment provider not configured');
  }
}

/**
 * Paying for orders. Depends on orders, never the reverse: orders don't need
 * to know how they get paid for.
 */
@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: PaymentProvider, useClass: UnconfiguredPaymentProvider }],
})
export class PaymentsModule {}
