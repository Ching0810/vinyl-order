import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  canChangeSupplierOrderStatus,
  type CreateSupplierOrderInput,
  type SupplierOrder as SupplierOrderContract,
  type SupplierOrderStatus,
  type UpdateSupplierOrderInput,
  type UpdateSupplierOrderItemInput,
} from '@vinyl-order/shared';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { violatesUniqueIndex } from '../prisma/unique-violation';
import { conflict } from './supplier-order.errors';
import { fromDay, toSupplierOrderContract, withItems } from './supplier-order.mapper';

/** The index that makes "the same order entered twice" a 409 (schema.prisma). */
const DUPLICATE_INDEX = 'SupplierOrder_userId_supplier_orderNumber_key';

/**
 * Newest order first. id breaks ties between orders placed on the same day,
 * so the list reads the same on every load.
 */
const listOrder = [
  { orderedAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.SupplierOrderOrderByWithRelationInput[];

/** An empty note is no note: store null, so "has a note" is one check. */
const blankToNull = (text: string | null | undefined): string | null => text || null;

/**
 * What create() records: the POST body, or an imported email's order, whose
 * lines may also carry a cover. The cover isn't part of the POST body
 * (supplierOrderItemSchema says why), so only email import can set one.
 */
export type NewSupplierOrder = Omit<CreateSupplierOrderInput, 'items'> & {
  items: (CreateSupplierOrderInput['items'][number] & { imageUrl?: string | null })[];
};

/**
 * A user's own record of what they ordered at the shops (tracker.md §9).
 *
 * Every query carries userId in its WHERE, so another user's order is simply
 * not found: 404, never 403, which would confirm the id exists. There is no
 * separate ownership check to forget.
 */
@Injectable()
export class SupplierOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * All of the user's orders with their lines. Not paginated: one person's
   * orders are a page's worth, and the page groups them by status, which
   * paging by date would split across pages.
   */
  async list(userId: string): Promise<SupplierOrderContract[]> {
    const orders = await this.prisma.supplierOrder.findMany({
      where: { userId },
      include: withItems,
      orderBy: listOrder,
    });
    return orders.map(toSupplierOrderContract);
  }

  /** One of the user's orders with its lines, as the edit form loads it. */
  async get(userId: string, id: string): Promise<SupplierOrderContract> {
    const order = await this.prisma.supplierOrder.findFirst({
      where: { id, userId },
      include: withItems,
    });
    if (!order) throw new NotFoundException('Supplier order not found');
    return toSupplierOrderContract(order);
  }

  /**
   * Record an order and its lines in one write, so an order never exists
   * without the lines it was entered with.
   *
   * 409 SUPPLIER_ORDER_DUPLICATE if this user already has this order number
   * at this shop. The unique index decides, not a lookup first: two submits of
   * one form could both pass a lookup.
   */
  async create(userId: string, input: NewSupplierOrder): Promise<SupplierOrderContract> {
    try {
      const order = await this.prisma.supplierOrder.create({
        data: {
          userId,
          supplier: input.supplier,
          orderNumber: input.orderNumber,
          orderedAt: fromDay(input.orderedAt),
          totalCents: input.totalCents ?? null,
          paidAt: input.paidAt ? fromDay(input.paidAt) : null,
          trackingNumber: input.trackingNumber ?? null,
          note: blankToNull(input.note),
          items: {
            create: input.items.map((item) => ({
              title: item.title,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              expectedMonth: item.expectedMonth ?? null,
              imageUrl: item.imageUrl ?? null,
            })),
          },
        },
        include: withItems,
      });
      return toSupplierOrderContract(order);
    } catch (error) {
      if (violatesUniqueIndex(error, DUPLICATE_INDEX)) {
        throw conflict(
          'SUPPLIER_ORDER_DUPLICATE',
          `Order ${input.orderNumber} at this shop is already recorded.`,
        );
      }
      throw error;
    }
  }

  /**
   * Change an order: its number, date, total, payment day, status, tracking
   * number, note or lines (replaceItems).
   *
   * Two guards, both compare-and-set — the UPDATE's WHERE carries what was
   * checked, so a change made in between matches nothing and is reported
   * instead of silently overwritten (the checkout's stock guard, again):
   *
   * - A status change only matches while the order still has the status the
   *   rule was checked against; else 409 with the status it has now.
   * - With `expectedUpdatedAt` (optimistic locking), the whole write only
   *   matches while the order is the version the client read; else 409
   *   SUPPLIER_ORDER_STALE. Every write moves updatedAt, so any change from
   *   another tab is caught, not only a status move.
   *
   * Sending the status the order already has is not a change, so a repeated
   * status submit succeeds instead of failing on its own first attempt.
   *
   * 409 SUPPLIER_ORDER_DUPLICATE if the new number is another of this user's
   * orders at this shop; as in create, the unique index decides.
   */
  async update(
    userId: string,
    id: string,
    input: UpdateSupplierOrderInput,
  ): Promise<SupplierOrderContract> {
    try {
      // One transaction, so a refused line leaves the order's fields unchanged
      // too: an edit is applied whole or not at all.
      await this.prisma.$transaction(async (transaction) => {
        await this.updateOrderRow(transaction, userId, id, input);
        if (input.items) await this.replaceItems(transaction, id, input.items);
      });
    } catch (error) {
      if (violatesUniqueIndex(error, DUPLICATE_INDEX)) {
        throw conflict(
          'SUPPLIER_ORDER_DUPLICATE',
          `Order ${input.orderNumber} at this shop is already recorded.`,
        );
      }
      throw error;
    }

    return this.get(userId, id);
  }

  /** Delete an order and its lines. */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.supplierOrder.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Supplier order not found');
  }

  /**
   * update()'s write to the order row itself, with both guards. Runs first in
   * the transaction: its UPDATE locks the row, so a second edit of the same
   * order waits here rather than interleaving its lines with this one's.
   */
  private async updateOrderRow(
    transaction: Prisma.TransactionClient,
    userId: string,
    id: string,
    input: UpdateSupplierOrderInput,
  ): Promise<void> {
    const current = await transaction.supplierOrder.findFirst({
      where: { id, userId },
      select: { status: true, updatedAt: true },
    });
    if (!current) throw new NotFoundException('Supplier order not found');

    const expectedUpdatedAt =
      input.expectedUpdatedAt === undefined ? undefined : new Date(input.expectedUpdatedAt);
    // Checked against the read too, not only in the WHERE, so a stale form is
    // reported as stale even when its status move would also be refused.
    if (expectedUpdatedAt && current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw this.stale();
    }

    // Field by field: the shop never changes, and a body is never passed
    // through as it came.
    const data: Prisma.SupplierOrderUpdateManyMutationInput = {};
    if (input.orderNumber !== undefined) data.orderNumber = input.orderNumber;
    if (input.orderedAt !== undefined) data.orderedAt = fromDay(input.orderedAt);
    if (input.totalCents !== undefined) data.totalCents = input.totalCents;
    if (input.paidAt !== undefined) data.paidAt = input.paidAt && fromDay(input.paidAt);
    if (input.trackingNumber !== undefined) data.trackingNumber = input.trackingNumber;
    if (input.note !== undefined) data.note = blankToNull(input.note);

    const nextStatus = input.status !== current.status ? input.status : undefined;
    if (nextStatus) {
      if (!canChangeSupplierOrderStatus(current.status, nextStatus)) {
        throw this.badTransition(current.status, nextStatus);
      }
      data.status = nextStatus;
    }

    // Lines live in their own table, so changing only them wouldn't touch
    // this row. Set its updatedAt anyway: the version must move whenever the
    // order as a whole changes, or another tab's stale lines would pass.
    if (input.items) data.updatedAt = new Date();

    const { count } = await transaction.supplierOrder.updateMany({
      where: {
        id,
        userId,
        ...(nextStatus ? { status: current.status } : {}),
        ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}),
      },
      data,
    });

    if (count === 0) {
      // Deleted in between, or changed since read: by version if the client
      // sent one, else (only when changing status) by status.
      const now = await transaction.supplierOrder.findFirst({
        where: { id, userId },
        select: { status: true },
      });
      if (!now) throw new NotFoundException('Supplier order not found');
      if (expectedUpdatedAt) throw this.stale();
      if (!nextStatus) throw new NotFoundException('Supplier order not found');
      throw this.badTransition(now.status, nextStatus);
    }
  }

  /**
   * Make the order's lines exactly `items`: lines with an id are updated,
   * lines without are added, and the order's other lines are removed. Called
   * after updateOrderRow, which has checked the order is this user's.
   *
   * 400 if an id isn't one of this order's lines — another order's line, or
   * one already removed, say by another tab. Recreating it would bring back
   * a line someone deleted; adopting another order's would move it.
   */
  private async replaceItems(
    transaction: Prisma.TransactionClient,
    supplierOrderId: string,
    items: UpdateSupplierOrderItemInput[],
  ): Promise<void> {
    const existing = await transaction.supplierOrderItem.findMany({
      where: { supplierOrderId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((line) => line.id));
    const keptIds = items.flatMap((item) => (item.id ? [item.id] : []));
    const unknown = keptIds.filter((itemId) => !existingIds.has(itemId));
    if (unknown.length > 0) {
      throw new BadRequestException(`Not a line of this order: ${unknown.join(', ')}`);
    }

    await transaction.supplierOrderItem.deleteMany({
      where: { supplierOrderId, id: { notIn: keptIds } },
    });

    // One UPDATE per kept line: each has its own values, and an order has at
    // most 50 lines.
    for (const { id, ...line } of items) {
      const fields = {
        title: line.title,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        expectedMonth: line.expectedMonth ?? null,
      };
      if (id) {
        await transaction.supplierOrderItem.update({ where: { id }, data: fields });
      } else {
        await transaction.supplierOrderItem.create({ data: { supplierOrderId, ...fields } });
      }
    }
  }

  private badTransition(from: SupplierOrderStatus, to: SupplierOrderStatus) {
    return conflict(
      'SUPPLIER_ORDER_BAD_TRANSITION',
      `A ${from} order can't be marked ${to}.`,
      // The status it has now, so the page can re-render without a reload.
      { status: from },
    );
  }

  private stale() {
    return conflict(
      'SUPPLIER_ORDER_STALE',
      'This order was changed after you opened it. Reload it and try again.',
    );
  }
}
