import {
  type CreateSupplierOrderInput,
  type SupplierOrder,
  type SupplierOrderErrorCode,
  supplierOrderErrorCodeSchema,
} from '@vinyl-order/shared';

import { HttpError, http } from '@/lib/core/http';

/**
 * POST /supplier-orders — record an order the signed-in user placed at a shop,
 * with its lines. Answers with the order as stored.
 *
 * 409 SUPPLIER_ORDER_DUPLICATE if they already recorded this order number at
 * this shop; 400 if the body fails the shared schema.
 */
export const createSupplierOrder = (input: CreateSupplierOrderInput): Promise<SupplierOrder> =>
  http.post<SupplierOrder>('/supplier-orders', input);

/**
 * The supplier-order code a refusal carries, or undefined for any other
 * error — a network failure, a 400, or a code this page doesn't know.
 * Parsed with the shared schema, so a typo can't match by accident.
 */
export const supplierOrderErrorCode = (error: unknown): SupplierOrderErrorCode | undefined => {
  if (!(error instanceof HttpError)) return undefined;
  return supplierOrderErrorCodeSchema.safeParse((error.body as { code?: unknown } | null)?.code)
    .data;
};
