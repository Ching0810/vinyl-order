'use client';

import { Button, Container, Spinner } from '@chakra-ui/react';
import NextLink from 'next/link';

import EmptyState from '@/components/ui/empty-state';
import { useMe } from '@/services/queries/auth/useMe';

import TrackingList from './list';

/**
 * The signed-in user's tracked versions, a page of its own reached from the
 * menu (tracker.md §12.1). Someone not signed in is asked to: the list is
 * theirs alone.
 */
export default function Tracking() {
  const { data: user, isPending } = useMe();

  const renderBody = () => {
    if (isPending) return <Spinner color="fg.muted" />;
    if (!user) {
      return (
        <EmptyState
          title="Sign in to see what you track"
          body="Track the versions you want from the shops, and compare their prices here."
          cta={
            <Button asChild colorPalette="brand" borderRadius="full">
              <NextLink href="/login">Sign in</NextLink>
            </Button>
          }
        />
      );
    }
    return <TrackingList />;
  };

  return (
    <Container maxW="7xl" px={{ base: '4', md: '8' }} py={{ base: '8', md: '14' }}>
      {renderBody()}
    </Container>
  );
}
