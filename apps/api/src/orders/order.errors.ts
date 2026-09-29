import { ConflictException } from '@nestjs/common';
import type { OrderErrorCode } from '@vinyl-order/shared';

/**
 * 409 body: a code the web can branch on, not a message it has to match. Typed
 * as the shared union, so a code the web does not know about cannot be sent.
 */
export const conflict = (
  code: OrderErrorCode,
  message: string,
  extra: object = {},
): ConflictException => new ConflictException({ statusCode: 409, code, message, ...extra });
