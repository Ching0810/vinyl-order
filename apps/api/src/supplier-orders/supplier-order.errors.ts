import { ConflictException } from '@nestjs/common';
import type { SupplierOrderErrorCode } from '@vinyl-order/shared';

/**
 * 409 body: a code the web can branch on, as order.errors.ts does for the demo
 * store's orders. Typed as the shared union, so an unknown code can't be sent.
 */
export const conflict = (
  code: SupplierOrderErrorCode,
  message: string,
  extra: object = {},
): ConflictException => new ConflictException({ statusCode: 409, code, message, ...extra });
