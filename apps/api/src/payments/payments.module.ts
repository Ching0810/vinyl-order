import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';

import { OrdersModule } from '../orders/orders.module';
import { mockPayAllowed } from './mockpay-allowed';
import { MockPayProvider } from './mockpay.provider';
import { PaymentProvider } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks.controller';

/**
 * Paying for orders. Depends on orders, never the reverse: orders don't need
 * to know how they get paid for. The import is for OrderLifecycleService, so a
 * settled payment moves its order through the same transitions as everything
 * else.
 *
 * The PaymentProvider is chosen by PAYMENT_PROVIDER, so PaymentsService
 * depends on the contract rather than a specific provider.
 */
@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PaymentsService,
    {
      provide: PaymentProvider,
      inject: [ConfigService, HttpAdapterHost],
      useFactory: (config: ConfigService, adapterHost: HttpAdapterHost): PaymentProvider => {
        const provider = config.get<string>('PAYMENT_PROVIDER') ?? 'mockpay';
        if (provider === 'mockpay') {
          const nodeEnv = config.getOrThrow<string>('NODE_ENV');
          const paymentDemo = config.getOrThrow<boolean>('PAYMENT_DEMO');
          // MockPay takes no real money and isn't mounted in production unless
          // PAYMENT_DEMO is on, so there every payment would fail. Refuse to
          // boot instead: the mistake shows at deploy, not when a customer
          // presses Pay.
          if (!mockPayAllowed(nodeEnv, paymentDemo)) {
            throw new Error(
              'PAYMENT_PROVIDER=mockpay is not allowed in production. ' +
                'Set PAYMENT_DEMO=true for a demo that takes no real money.',
            );
          }
          if (nodeEnv === 'production') {
            // Allowed on purpose, but anyone reading the logs should see it.
            new Logger(PaymentsModule.name).warn(
              'MockPay is enabled in production (PAYMENT_DEMO=true): no real money is taken',
            );
          }
          return new MockPayProvider(config, adapterHost);
        }
        throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`);
      },
    },
  ],
})
export class PaymentsModule {}
