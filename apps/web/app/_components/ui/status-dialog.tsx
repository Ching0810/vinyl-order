'use client';

import { Box, Dialog, HStack, Portal } from '@chakra-ui/react';
import { useEffect } from 'react';

import { AlertCircleIcon, CheckCircleIcon } from '@/components/ui/icons';

/** What a StatusDialog says: whether it worked, and one line about it. */
export interface StatusNotice {
  status: 'success' | 'error';
  message: string;
}

/** Long enough to read a short line; short enough not to be in the way. */
const AUTO_CLOSE_MS = 1500;
/**
 * A short result shown over a dimmed page — "Added to your cart", or why it
 * didn't work.
 *
 * Success closes itself; an error stays until dismissed — a click on the
 * backdrop, or Escape — since it may need reading. Built on Chakra's
 * Dialog, so focus and Escape behave like any other modal.
 *
 * `closeOnInteractOutside` is set explicitly: an error uses the alertdialog
 * role, and for that role the dialog defaults to ignoring backdrop clicks (it
 * is meant for prompts that demand an answer). This one only reports, so a
 * click anywhere outside should dismiss it.
 *
 * `open` is separate from `notice` so the message stays in place while the
 * dialog animates out, instead of blanking the moment it starts closing.
 *
 * @param open - whether the dialog is showing
 * @param notice - what to show; kept after closing for the exit animation
 * @param onClose - called when it should close (timer, click outside, Escape)
 */
export default function StatusDialog({
  open,
  notice,
  onClose,
}: {
  open: boolean;
  notice: StatusNotice | null;
  onClose: () => void;
}) {
  const success = notice?.status === 'success';

  useEffect(() => {
    if (!open || !success) return undefined;
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open, success, onClose]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      placement="center"
      size="xs"
      role={success ? 'dialog' : 'alertdialog'}
      closeOnInteractOutside
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="card" mx="4">
            <Dialog.Body px="6" py="5">
              <HStack gap="3">
                <Box fontSize="2xl" color={success ? 'green.500' : 'red.500'} flexShrink="0">
                  {success ? <CheckCircleIcon /> : <AlertCircleIcon />}
                </Box>
                <Dialog.Title fontSize="md" fontWeight="medium">
                  {notice?.message}
                </Dialog.Title>
              </HStack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
