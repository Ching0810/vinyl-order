'use client';

import { HStack, Link, chakra } from '@chakra-ui/react';
import NextLink from 'next/link';

import { MailIcon } from '@/components/ui/icons';
import { formatTimeAgo } from '@/lib/utils/date';
import { useMe } from '@/services/queries/auth/useMe';
import { useSupplierOrderImportToken } from '@/services/queries/supplier-order-import-token/useSupplierOrderImportToken';

/** The daily run is late once it hasn't come for two days: it missed one. */
const LATE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * The email import's state, as a quiet line under the page's description,
 * leading to its page. Set up once, it runs by itself, so the list page
 * shows whether it is running rather than a button beside "Record an
 * order" for something rarely changed. Always there for a signed-in user,
 * so the setup stays in reach after it's done.
 *
 * - no token yet → "isn't set up · Set up"
 * - a token, never used → waiting for the script's first run
 * - used → when it last ran; amber once it is late, since the script may
 *   have stopped (a revoked token, a Google consent lapsed)
 */
export default function EmailImportLink() {
  const { data: user } = useMe();
  const { data } = useSupplierOrderImportToken();
  if (!user) return null;

  const importToken = data?.importToken ?? null;
  const lastUsedAt = importToken?.lastUsedAt ?? null;
  const late = lastUsedAt !== null && Date.now() - Date.parse(lastUsedAt) > LATE_MS;

  let status = "isn't set up";
  if (importToken && !lastUsedAt) status = 'waiting for its first run';
  if (lastUsedAt) status = `last run ${formatTimeAgo(lastUsedAt)}`;

  return (
    <Link asChild fontSize="sm" color="fg.muted" _hover={{ color: 'fg' }}>
      <NextLink href="/supplier-orders/import">
        <HStack as="span" gap="1.5" minW="0">
          <MailIcon />
          <chakra.span truncate>
            Email import ·{' '}
            <chakra.span color={late ? 'orange.600' : undefined}>{status}</chakra.span> ·{' '}
            {importToken ? 'Settings' : 'Set up'} ›
          </chakra.span>
        </HStack>
      </NextLink>
    </Link>
  );
}
