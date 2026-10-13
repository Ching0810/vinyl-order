import { Module } from '@nestjs/common';

import { CheckoutService } from './checkout.service';
import { OrderExpiryService } from './order-expiry.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, CheckoutService, OrderLifecycleService, OrderExpiryService],
  // Every order status change goes through the lifecycle, including the ones
  // payments make. OrdersService is for payments' cancel route, which voids a
  // pending payment before handing the cancellation back to orders.
  exports: [OrderLifecycleService, OrdersService],
})
export class OrdersModule {}
