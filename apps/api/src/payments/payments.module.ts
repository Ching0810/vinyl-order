import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';

import { MockPayProvider } from './mockpay.provider';
import { PaymentProvider } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * Paying for orders. Depends on orders, never the reverse: orders don't need
 * to know how they get paid for.
 *
 * The PaymentProvider is chosen by PAYMENT_PROVIDER, so PaymentsService
 * depends on the contract rather than a specific provider.
 */
@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PaymentProvider,
      inject: [ConfigService, HttpAdapterHost],
      useFactory: (config: ConfigService, adapterHost: HttpAdapterHost): PaymentProvider => {
        const provider = config.get<string>('PAYMENT_PROVIDER') ?? 'mockpay';
        if (provider === 'mockpay') {
          // MockPay takes no real money and is not mounted in production, so
          // there every payment would fail. Refuse to boot instead: the mistake
          // shows at deploy, not when a customer presses Pay.
          if (config.get<string>('NODE_ENV') === 'production') {
            throw new Error('PAYMENT_PROVIDER=mockpay is not allowed in production');
          }
          return new MockPayProvider(config, adapterHost);
        }
        throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`);
      },
    },
  ],
})
export class PaymentsModule {}
