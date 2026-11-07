import {
  type SupplierOrderErrorCode,
  type SupplierOrderStatus,
  supplierOrderErrorCodeSchema,
  supplierOrderStatusSchema,
} from '@vinyl-order/shared';

import { HttpError } from '@/lib/core/http';

const bodyOf = (error: unknown): Record<string, unknown> | null =>
  error instanceof HttpError && typeof error.body === 'object'
    ? (error.body as Record<string, unknown> | null)
    : null;

/**
 * The supplier-order code a refusal carries, or undefined for any other
 * error — a network failure, a 400, or a code this page doesn't know.
 * Parsed with the shared schema, so a typo can't match by accident.
 */
export const supplierOrderErrorCode = (error: unknown): SupplierOrderErrorCode | undefined =>
  supplierOrderErrorCodeSchema.safeParse(bodyOf(error)?.code).data;

/**
 * The status a SUPPLIER_ORDER_BAD_TRANSITION says the order has now — moved
 * by another tab, say — or undefined if the error isn't one.
 */
export const currentStatusOf = (error: unknown): SupplierOrderStatus | undefined =>
  supplierOrderErrorCode(error) === 'SUPPLIER_ORDER_BAD_TRANSITION'
    ? supplierOrderStatusSchema.safeParse(bodyOf(error)?.status).data
    : undefined;
