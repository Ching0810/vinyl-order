'use client';

import { Button, Dialog, Field, Input, Portal, Stack, Text, Textarea } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';
import { useForm } from 'react-hook-form';

import { useUpdateSupplierOrder } from '@/services/queries/supplier-orders/useUpdateSupplierOrder';

interface Values {
  trackingNumber: string;
  note: string;
}

/** The fields' limits, as the API's updateSupplierOrderSchema has them. */
const MAX_TRACKING = 100;
const MAX_NOTE = 1000;

/**
 * Edit an order's tracking number and note — the two things that arrive
 * after it's placed. A field left empty is cleared (sent as null).
 *
 * Mounted only while open, so it starts from the order as it is now each
 * time, not from what was typed and abandoned last time.
 *
 * @param order - the order being edited
 * @param onClose - close the dialog; called after a save, or on cancel
 */
export default function EditTrackingDialog({
  order,
  onClose,
}: {
  order: SupplierOrder;
  onClose: () => void;
}) {
  const updateMutation = useUpdateSupplierOrder();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: { trackingNumber: order.trackingNumber ?? '', note: order.note ?? '' },
  });

  const save = handleSubmit((values) => {
    updateMutation.mutate(
      {
        id: order.id,
        input: {
          trackingNumber: values.trackingNumber.trim() || null,
          note: values.note.trim() || null,
        },
      },
      { onSuccess: onClose },
    );
  });

  return (
    <Dialog.Root
      open
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      placement="center"
      size="sm"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="card" mx="4">
            <form onSubmit={save} noValidate>
              <Dialog.Header>
                <Dialog.Title>Tracking & note</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Stack gap="4">
                  <Field.Root invalid={Boolean(errors.trackingNumber)}>
                    <Field.Label>Tracking number</Field.Label>
                    <Input
                      autoComplete="off"
                      {...register('trackingNumber', {
                        maxLength: { value: MAX_TRACKING, message: 'Too long' },
                      })}
                    />
                    <Field.ErrorText>{errors.trackingNumber?.message}</Field.ErrorText>
                  </Field.Root>
                  <Field.Root invalid={Boolean(errors.note)}>
                    <Field.Label>Note</Field.Label>
                    <Textarea
                      rows={3}
                      {...register('note', { maxLength: { value: MAX_NOTE, message: 'Too long' } })}
                    />
                    <Field.ErrorText>{errors.note?.message}</Field.ErrorText>
                  </Field.Root>
                  {updateMutation.isError ? (
                    <Text fontSize="sm" color="fg.error">
                      Couldn&apos;t save. Please try again.
                    </Text>
                  ) : null}
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button variant="ghost" borderRadius="full" disabled={updateMutation.isPending}>
                    Cancel
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  type="submit"
                  colorPalette="brand"
                  borderRadius="full"
                  loading={updateMutation.isPending}
                >
                  Save
                </Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
