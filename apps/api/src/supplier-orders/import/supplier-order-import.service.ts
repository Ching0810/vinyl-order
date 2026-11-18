import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import {
  createSupplierOrderSchema,
  type ImportSupplierOrderEmailInput,
  type ImportSupplierOrderResult,
} from '@vinyl-order/shared';

import { isConflict } from '../supplier-order.errors';
import { SupplierOrdersService } from '../supplier-orders.service';
import { isConfirmation, parseConfirmation } from './parse-confirmation';
import { parseNotice } from './parse-notice';
import { SupplierOrderNoticesService } from './supplier-order-notices.service';

/** 422: the email isn't one this site can read. Never quotes it. */
const unreadable = (reason: string): UnprocessableEntityException =>
  new UnprocessableEntityException({
    statusCode: 422,
    code: 'SUPPLIER_ORDER_EMAIL_UNREADABLE',
    message: "This email couldn't be read as an order confirmation or notice.",
    reason,
  });

/**
 * Records the order a shop's confirmation email describes (tracker.md §9.4),
 * and moves an order on by the shop's payment and shipping notices (§9.5).
 *
 * The body is read and dropped: nothing of it is stored but the order or
 * the step it reports, and nothing of it is logged — it carries the buyer's
 * name and address.
 */
@Injectable()
export class SupplierOrderImportService {
  private readonly logger = new Logger(SupplierOrderImportService.name);

  constructor(
    private readonly supplierOrders: SupplierOrdersService,
    private readonly notices: SupplierOrderNoticesService,
  ) {}

  /**
   * Read the email and record its order, or apply its notice, for the user.
   * One route for both, told apart by subject, so the Apps Script keeps one
   * URL however many kinds of email are read (tracker.md §9.5).
   *
   * Nothing about the order is returned either way: the route only writes.
   *
   * @param userId - whose import token sent it
   * @param email - as the Apps Script sends it
   */
  async import(
    userId: string,
    email: ImportSupplierOrderEmailInput,
  ): Promise<ImportSupplierOrderResult> {
    if (isConfirmation(email)) return this.record(userId, email);

    const parsed = parseNotice(email);
    if (!parsed.ok) {
      this.logger.warn(`Email not imported: ${parsed.reason}`);
      throw unreadable(parsed.reason);
    }
    return { result: await this.notices.apply(userId, parsed.notice) };
  }

  /**
   * Record the order a confirmation describes.
   *
   * An order already in the list — the email sent twice, or typed in by hand
   * first — is not an error: the unique order number is the idempotency key,
   * so the answer is `already_recorded`.
   */
  private async record(
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
    // copies, covers only from the shops' own image hosts): an email can't
    // record what the form couldn't.
    const valid = createSupplierOrderSchema.safeParse(order);
    if (!valid.success) {
      this.logger.warn(`Email from ${order.supplier} not imported: outside the order limits`);
      throw unreadable('the order is outside what can be recorded');
    }

    try {
      await this.supplierOrders.create(userId, valid.data);
      return { result: 'created' };
    } catch (error) {
      if (isConflict(error, 'SUPPLIER_ORDER_DUPLICATE')) return { result: 'already_recorded' };
      throw error;
    }
  }
}
