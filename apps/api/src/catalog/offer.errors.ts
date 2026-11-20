import {
  BadGatewayException,
  ConflictException,
  HttpException,
  HttpStatus,
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

/** 429: the record was read again too lately; try in `retryAfterSeconds`. */
export const refreshTooSoon = (retryAfterSeconds: number): HttpException =>
  new HttpException(
    {
      statusCode: 429,
      code: 'REFRESH_TOO_SOON' satisfies OfferErrorCode,
      message: 'This record was refreshed a moment ago.',
      retryAfterSeconds,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );

/**
 * The code an error made here carries, and the rest of its body — for a
 * caller that goes on past some refusals, as tracking an album does past a
 * listing another record has.
 */
export const offerErrorBodyOf = (
  error: unknown,
): ({ code: OfferErrorCode } & Record<string, unknown>) | null => {
  if (!(error instanceof HttpException)) return null;
  const body = error.getResponse();
  return typeof body === 'object' && 'code' in body
    ? (body as { code: OfferErrorCode } & Record<string, unknown>)
    : null;
};
