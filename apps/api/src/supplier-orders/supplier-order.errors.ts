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

/** Whether an error is the 409 `conflict` made with this code. */
export const isConflict = (error: unknown, code: SupplierOrderErrorCode): boolean => {
  if (!(error instanceof ConflictException)) return false;
  const body = error.getResponse();
  return typeof body === 'object' && 'code' in body && body.code === code;
};
