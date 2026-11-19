import {
  BadGatewayException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { OfferErrorCode } from '@vinyl-order/shared';

/**
 * Error bodies with a code the web can branch on, as supplier-order.errors.ts
 * does. Typed as the shared union, so an unknown code can't be sent.
 */
export const offerConflict = (
  code: OfferErrorCode,
  message: string,
  extra: object = {},
): ConflictException => new ConflictException({ statusCode: 409, code, message, ...extra });

export const offerUnprocessable = (
  code: OfferErrorCode,
  message: string,
): UnprocessableEntityException =>
  new UnprocessableEntityException({ statusCode: 422, code, message });

/**
 * 502: the shop's page couldn't be fetched or read. `reason` is the fetcher's
 * or reader's short phrase ("answered 404", "no product data on the page"):
 * it never quotes the page.
 */
export const shopPageUnreadable = (reason: string): BadGatewayException =>
  new BadGatewayException({
    statusCode: 502,
    code: 'SHOP_PAGE_UNREADABLE' satisfies OfferErrorCode,
    message: "The shop's page couldn't be read.",
    reason,
  });
