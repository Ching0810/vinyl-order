'use client';

import { IconButton, Menu, Portal } from '@chakra-ui/react';
import {
  type SupplierOrder,
  type SupplierOrderStatus,
  canChangeSupplierOrderStatus,
  supplierOrderStatusSchema,
} from '@vinyl-order/shared';
import { useState } from 'react';

import ConfirmDialog from '@/components/ui/confirm-dialog';
import { MoreIcon } from '@/components/ui/icons';
import { HttpError } from '@/lib/core/http';
import { SUPPLIER_LABEL, SUPPLIER_ORDER_STATUS } from '@/lib/utils/supplier-order';
import { currentStatusOf } from '@/services/api/supplier-orders/errors';
import { useDeleteSupplierOrder } from '@/services/queries/supplier-orders/useDeleteSupplierOrder';
import { useUpdateSupplierOrder } from '@/services/queries/supplier-orders/useUpdateSupplierOrder';

import EditTrackingDialog from './edit-dialog';

/**
 * The statuses that are final: once there, an order can't be moved on or
 * back (canChangeSupplierOrderStatus), so a slip of the finger is asked about.
 */
const FINAL: Partial<
  Record<SupplierOrderStatus, { title: string; body: string; confirm: string; palette: string }>
> = {
  delivered: {
    title: 'Mark as delivered?',
    body: "Delivered is final: the order can't be moved back afterwards.",
    confirm: 'Mark as delivered',
    palette: 'green',
  },
  cancelled: {
    title: 'Mark this order cancelled?',
    body: "This only records it here — it doesn't cancel anything at the shop. A cancelled order can't be moved back.",
    confirm: 'Mark as cancelled',
    palette: 'red',
  },
};

/** What the menu calls a move to each status. */
const moveLabel = (to: SupplierOrderStatus): string =>
  to === 'cancelled' ? 'Mark as cancelled' : `Mark as ${SUPPLIER_ORDER_STATUS[to].label}`;

/** Why a change didn't happen, in the user's terms. */
const failureMessage = (error: unknown): string => {
  const now = currentStatusOf(error);
  if (now) {
    return `This order is already ${SUPPLIER_ORDER_STATUS[now].label.toLowerCase()}, so it was left as it is.`;
  }
  if (error instanceof HttpError && error.status === 404) return 'This order no longer exists.';
  return "Couldn't update the order. Please try again.";
};

/** Which dialog is open, if any. */
type Open = { kind: 'confirm'; to: SupplierOrderStatus } | { kind: 'edit' } | { kind: 'delete' };

/**
 * An order's actions, behind a "more" button: move it on to any status the
 * shared rule allows from where it is (and only those), edit its tracking
 * number and note, or delete it.
 *
 * Moving to a final status and deleting ask first. A refusal — typically
 * another tab having moved the order already — is handed to onFailure while
 * the list refreshes underneath (see useUpdateSupplierOrder). The message is
 * shown by the list, not here: the refresh can move this card to another
 * group, which remounts it and would take a dialog of its own with it.
 *
 * @param order - the order the actions apply to
 * @param onFailure - show why an action didn't happen
 */
export default function SupplierOrderActions({
  order,
  onFailure,
}: {
  order: SupplierOrder;
  onFailure: (message: string) => void;
}) {
  const updateMutation = useUpdateSupplierOrder();
  const deleteMutation = useDeleteSupplierOrder();
  const [open, setOpen] = useState<Open | null>(null);

  const report = (error: unknown) => onFailure(failureMessage(error));
  const close = () => setOpen(null);

  const move = (to: SupplierOrderStatus) =>
    updateMutation.mutate(
      { id: order.id, input: { status: to } },
      { onError: report, onSettled: close },
    );

  const remove = () =>
    deleteMutation.mutate(order.id, {
      // A 404 means it's already gone, which is what was asked for.
      onError: (error) =>
        error instanceof HttpError && error.status === 404 ? null : report(error),
      onSettled: close,
    });

  const choose = (value: string) => {
    if (value === 'edit' || value === 'delete') return setOpen({ kind: value });
    const to = supplierOrderStatusSchema.parse(value);
    return FINAL[to] ? setOpen({ kind: 'confirm', to }) : move(to);
  };

  const nextStatuses = supplierOrderStatusSchema.options.filter((to) =>
    canChangeSupplierOrderStatus(order.status, to),
  );
  const final = open?.kind === 'confirm' ? FINAL[open.to] : undefined;

  return (
    <>
      <Menu.Root onSelect={({ value }) => choose(value)}>
        <Menu.Trigger asChild>
          <IconButton
            aria-label={`Actions for order ${order.orderNumber}`}
            variant="ghost"
            size="sm"
            disabled={updateMutation.isPending || deleteMutation.isPending}
          >
            <MoreIcon />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="52">
              {nextStatuses.map((to) => (
                <Menu.Item key={to} value={to}>
                  {moveLabel(to)}
                </Menu.Item>
              ))}
              {nextStatuses.length > 0 ? <Menu.Separator /> : null}
              <Menu.Item value="edit">Edit tracking & note</Menu.Item>
              <Menu.Separator />
              <Menu.Item value="delete" color="fg.error">
                Delete
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>

      {open?.kind === 'confirm' && final ? (
        <ConfirmDialog
          open
          onOpenChange={(isOpen) => (isOpen ? null : close())}
          title={final.title}
          body={final.body}
          confirmLabel={final.confirm}
          palette={final.palette}
          pending={updateMutation.isPending}
          onConfirm={() => move(open.to)}
        />
      ) : null}

      <ConfirmDialog
        open={open?.kind === 'delete'}
        onOpenChange={(isOpen) => (isOpen ? null : close())}
        title="Delete this order?"
        body={`${SUPPLIER_LABEL[order.supplier]} order ${order.orderNumber} and its records will be removed from your list. This can't be undone.`}
        confirmLabel="Delete"
        pending={deleteMutation.isPending}
        onConfirm={remove}
      />

      {open?.kind === 'edit' ? <EditTrackingDialog order={order} onClose={close} /> : null}
    </>
  );
}
