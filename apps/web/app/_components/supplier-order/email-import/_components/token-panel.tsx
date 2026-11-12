'use client';

import { Button, HStack, Skeleton, Stack, Text } from '@chakra-ui/react';
import type { SupplierOrderImportToken } from '@vinyl-order/shared';
import { useState } from 'react';

import ConfirmDialog from '@/components/ui/confirm-dialog';
import Panel from '@/components/ui/panel';
import { formatDateTime, formatTimeAgo } from '@/lib/utils/date';
import { useCreateSupplierOrderImportToken } from '@/services/queries/supplier-order-import-token/useCreateSupplierOrderImportToken';
import { useDeleteSupplierOrderImportToken } from '@/services/queries/supplier-order-import-token/useDeleteSupplierOrderImportToken';
import { useSupplierOrderImportToken } from '@/services/queries/supplier-order-import-token/useSupplierOrderImportToken';

import RevealedToken from './revealed-token';

/** The two changes that break a running script, so they are asked about. */
const CONFIRM = {
  replace: {
    title: 'Replace your import token?',
    body: 'The current token stops working at once. Your Apps Script won’t import anything until you paste the new token into it.',
    confirmLabel: 'Replace token',
    palette: 'brand',
  },
  revoke: {
    title: 'Revoke your import token?',
    body: 'Your Apps Script stops importing at once. You can create a new token later.',
    confirmLabel: 'Revoke',
    palette: 'red',
  },
} as const;

/** Whether there is a token, and when the script last used it. */
const TokenStatus = ({ importToken }: { importToken: SupplierOrderImportToken | null }) => {
  if (!importToken) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No import token yet. Create one to set up the script.
      </Text>
    );
  }
  return (
    <Stack gap="1" fontSize="sm">
      <Text>Created {formatDateTime(importToken.createdAt)}</Text>
      <Text color="fg.muted">
        {importToken.lastUsedAt
          ? `Last import ${formatTimeAgo(importToken.lastUsedAt)}`
          : 'Not used yet — the script runs once a day.'}
      </Text>
    </Stack>
  );
};

/**
 * The user's import token: whether there is one, when the script last used
 * it — the quickest sign the daily import is running — and the buttons to
 * create, replace or revoke it. A new token is shown once, here.
 */
export default function ImportTokenPanel() {
  const { data, isPending, isError } = useSupplierOrderImportToken();
  const createMutation = useCreateSupplierOrderImportToken();
  const deleteMutation = useDeleteSupplierOrderImportToken();
  const [confirming, setConfirming] = useState<keyof typeof CONFIRM | null>(null);
  // Held here, not read back from the cache: the cache never holds the token.
  const [revealed, setRevealed] = useState<string | null>(null);

  const create = () =>
    createMutation.mutate(undefined, {
      onSuccess: ({ token }) => setRevealed(token),
      onSettled: () => setConfirming(null),
    });

  const revoke = () =>
    deleteMutation.mutate(undefined, {
      onSuccess: () => setRevealed(null),
      onSettled: () => setConfirming(null),
    });

  if (isPending) return <Skeleton h="32" borderRadius="card" />;
  if (isError) return <Text color="fg.error">Couldn&apos;t load your import token.</Text>;

  const { importToken } = data;
  const failed = createMutation.isError || deleteMutation.isError;
  const dialog = confirming ? CONFIRM[confirming] : null;

  return (
    <Panel title="Import token" description="What lets your Apps Script add orders to your list.">
      {revealed ? <RevealedToken token={revealed} /> : null}

      <TokenStatus importToken={importToken} />

      {failed ? (
        <Text fontSize="sm" color="fg.error">
          Couldn&apos;t update your import token. Please try again.
        </Text>
      ) : null}

      <HStack gap="3" wrap="wrap">
        {importToken ? (
          <>
            <Button size="sm" borderRadius="full" onClick={() => setConfirming('replace')}>
              Replace token
            </Button>
            <Button
              size="sm"
              variant="ghost"
              colorPalette="red"
              borderRadius="full"
              onClick={() => setConfirming('revoke')}
            >
              Revoke
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            colorPalette="brand"
            borderRadius="full"
            loading={createMutation.isPending}
            onClick={create}
          >
            Create import token
          </Button>
        )}
      </HStack>

      {dialog ? (
        <ConfirmDialog
          open
          onOpenChange={(isOpen) => (isOpen ? null : setConfirming(null))}
          title={dialog.title}
          body={dialog.body}
          confirmLabel={dialog.confirmLabel}
          palette={dialog.palette}
          pending={createMutation.isPending || deleteMutation.isPending}
          onConfirm={confirming === 'replace' ? create : revoke}
        />
      ) : null}
    </Panel>
  );
}
