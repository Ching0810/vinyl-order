'use client';

import { Button, Dialog, Portal, Text } from '@chakra-ui/react';

/**
 * A yes/no question before something that can't be undone — the shape
 * CancelOrder's dialog has, for callers that only need the words changed.
 *
 * An alertdialog: it waits for an answer, so a click on the backdrop doesn't
 * dismiss it; Escape or the cancel button does.
 *
 * @param open - whether it's showing
 * @param onOpenChange - called with false when it should close
 * @param title - the question
 * @param body - what happens, and that it can't be undone
 * @param confirmLabel - the confirming button's words
 * @param cancelLabel - the backing-out button's words
 * @param palette - the confirming button's colour; red for destructive
 * @param pending - the action is running: confirm shows busy, cancel is off
 * @param onConfirm - run the action; the caller closes the dialog when done
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Keep it',
  palette = 'red',
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  palette?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      role="alertdialog"
      placement="center"
      size="sm"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="card" mx="4">
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text color="fg.muted">{body}</Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="ghost" borderRadius="full" disabled={pending}>
                  {cancelLabel}
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette={palette}
                borderRadius="full"
                loading={pending}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
