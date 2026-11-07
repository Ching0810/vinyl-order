import { Injectable, NotFoundException } from '@nestjs/common';
import {
  canChangeSupplierOrderStatus,
  type CreateSupplierOrderInput,
  type SupplierOrder as SupplierOrderContract,
  type SupplierOrderStatus,
  type UpdateSupplierOrderInput,
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

  /**
   * Record an order and its lines in one write, so an order never exists
   * without the lines it was entered with.
   *
   * 409 SUPPLIER_ORDER_DUPLICATE if this user already has this order number
   * at this shop. The unique index decides, not a lookup first: two submits of
   * one form could both pass a lookup.
   */
  async create(userId: string, input: CreateSupplierOrderInput): Promise<SupplierOrderContract> {
    try {
      const order = await this.prisma.supplierOrder.create({
        data: {
          userId,
          supplier: input.supplier,
          orderNumber: input.orderNumber,
          orderedAt: fromDay(input.orderedAt),
          totalCents: input.totalCents ?? null,
          trackingNumber: input.trackingNumber ?? null,
          note: blankToNull(input.note),
          items: {
            create: input.items.map((item) => ({
              title: item.title,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              expectedMonth: item.expectedMonth ?? null,
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
   * Change an order's status, tracking number or note.
   *
   * A status change is a compare-and-set: the UPDATE only matches while the
   * order still has the status the rule was checked against. If another tab
   * changed it in between, nothing is written and the caller gets 409 with
   * the status it has now, instead of one request silently overwriting the
   * other — the same conditional-UPDATE idea as the checkout's stock guard.
   *
   * Sending the status the order already has is not a change, so a repeated
   * submit succeeds instead of failing on its own first attempt.
   */
  async update(
    userId: string,
    id: string,
    input: UpdateSupplierOrderInput,
  ): Promise<SupplierOrderContract> {
    const current = await this.prisma.supplierOrder.findFirst({
      where: { id, userId },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('Supplier order not found');

    // Only these fields: the shop, the number and the lines never change, and
    // a body is never passed through as it came.
    const data: Prisma.SupplierOrderUpdateManyMutationInput = {};
    if (input.trackingNumber !== undefined) data.trackingNumber = input.trackingNumber;
    if (input.note !== undefined) data.note = blankToNull(input.note);

    const nextStatus = input.status !== current.status ? input.status : undefined;
    if (nextStatus) {
      if (!canChangeSupplierOrderStatus(current.status, nextStatus)) {
        throw this.badTransition(current.status, nextStatus);
      }
      data.status = nextStatus;
    }

    const { count } = await this.prisma.supplierOrder.updateMany({
      where: { id, userId, ...(nextStatus ? { status: current.status } : {}) },
      data,
    });

    if (count === 0) {
      // Deleted in between, or (only when changing status) moved since read.
      const now = await this.prisma.supplierOrder.findFirst({
        where: { id, userId },
        select: { status: true },
      });
      if (!now || !nextStatus) throw new NotFoundException('Supplier order not found');
      throw this.badTransition(now.status, nextStatus);
    }

    return this.findOne(userId, id);
  }

  /** Delete an order and its lines: how a mistyped one is corrected. */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.supplierOrder.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Supplier order not found');
  }

  private async findOne(userId: string, id: string): Promise<SupplierOrderContract> {
    const order = await this.prisma.supplierOrder.findFirst({
      where: { id, userId },
      include: withItems,
    });
    if (!order) throw new NotFoundException('Supplier order not found');
    return toSupplierOrderContract(order);
  }

  private badTransition(from: SupplierOrderStatus, to: SupplierOrderStatus) {
    return conflict(
      'SUPPLIER_ORDER_BAD_TRANSITION',
      `A ${from} order can't be marked ${to}.`,
      // The status it has now, so the page can re-render without a reload.
      { status: from },
    );
  }
}
