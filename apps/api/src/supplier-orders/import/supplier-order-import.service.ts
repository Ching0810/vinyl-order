import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import {
  createSupplierOrderSchema,
  type ImportSupplierOrderEmailInput,
  type ImportSupplierOrderResult,
} from '@vinyl-order/shared';

import { isConflict } from '../supplier-order.errors';
import { SupplierOrdersService } from '../supplier-orders.service';
import { parseConfirmation } from './parse-confirmation';

/** 422: the email isn't a confirmation this site can read. Never quotes it. */
const unreadable = (reason: string): UnprocessableEntityException =>
  new UnprocessableEntityException({
    statusCode: 422,
    code: 'SUPPLIER_ORDER_EMAIL_UNREADABLE',
    message: "This email couldn't be read as an order confirmation.",
    reason,
  });

/**
 * Records the order a shop's confirmation email describes (tracker.md §9.4).
 *
 * The body is read and dropped: nothing of it is stored but the order, and
 * nothing of it is logged — it carries the buyer's name and address.
 */
@Injectable()
export class SupplierOrderImportService {
  private readonly logger = new Logger(SupplierOrderImportService.name);

  constructor(private readonly supplierOrders: SupplierOrdersService) {}

  /**
   * Read the email and record its order for the user.
   *
   * An order already in the list — the email sent twice, or typed in by hand
   * first — is not an error: the unique order number is the idempotency key,
   * so the answer is `already_recorded`. Nothing about that order is
   * returned either way.
   *
   * @param userId - whose import token sent it
   * @param email - as the Apps Script sends it
   */
  async import(
    userId: string,
    email: ImportSupplierOrderEmailInput,
  ): Promise<ImportSupplierOrderResult> {
    const parsed = parseConfirmation(email);
    if (!parsed.ok) {
      this.logger.warn(`Email not imported: ${parsed.reason}`);
      throw unreadable(parsed.reason);
    }
    const { order } = parsed;

    // The same limits a typed order meets (title length, 50 lines, 99
    // copies…): an email can't record what the form couldn't. The cover is
    // checked by the parser, which keeps only the shops' CDNs.
    const valid = createSupplierOrderSchema.safeParse({
      ...order,
      items: order.items.map((line) => {
        return {
          title: line.title,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          expectedMonth: line.expectedMonth,
        };
      }),
    });
    if (!valid.success) {
      this.logger.warn(`Email from ${order.supplier} not imported: outside the order limits`);
      throw unreadable('the order is outside what can be recorded');
    }

    try {
      await this.supplierOrders.create(userId, {
        ...valid.data,
        items: valid.data.items.map((line, index) => {
          return { ...line, imageUrl: order.items[index].imageUrl };
        }),
      });
      return { result: 'created' };
    } catch (error) {
      if (isConflict(error, 'SUPPLIER_ORDER_DUPLICATE')) return { result: 'already_recorded' };
      throw error;
    }
  }
}
