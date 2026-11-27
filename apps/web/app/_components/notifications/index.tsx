'use client';

import { Button, Skeleton, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useEffect } from 'react';

import EmptyState from '@/components/ui/empty-state';
import Paginator from '@/components/ui/paginator';
import { type PageTarget, pageCount, useCursorPages } from '@/hooks/useCursorPages';
import { useMe } from '@/services/queries/auth/useMe';
import { useMarkNotificationsRead } from '@/services/queries/notifications/useMarkNotificationsRead';
import { useNotifications } from '@/services/queries/notifications/useNotifications';

import Row from './_components/row';

const PAGE_SIZE = 10;

const ListSkeleton = () => (
  <Stack gap="3">
    {Array.from({ length: 3 }, (_, i) => (
      <Skeleton key={i} h="24" borderRadius="card" />
    ))}
  </Stack>
);

/**
 * The signed-in user's price drops, newest first, a page at a time
 * (tracker.md §12.3). Opening the page marks them all read; the list keeps
 * the marks it was loaded with, so what is new this visit still shows as new.
 */
export default function Notifications() {
  const { data: user, isPending: authPending } = useMe();
  const pages = useCursorPages(PAGE_SIZE);
  const { data, isPending, isError, isPlaceholderData } = useNotifications(pages.args);
  const markRead = useMarkNotificationsRead();
  const { mutate: markAllRead } = markRead;

  const hasUnread = !!data?.edges.some(({ node }) => node.readAt === null);
  useEffect(() => {
    if (hasUnread) markAllRead();
  }, [hasUnread, markAllRead]);

  if (authPending) return <ListSkeleton />;

  if (!user) {
    return (
      <EmptyState
        title="Sign in to see your notifications"
        body="When a version you track drops in price, it's told here."
        cta={
          <Button asChild colorPalette="brand" borderRadius="full">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        }
      />
    );
  }

  if (isPending) return <ListSkeleton />;
  if (isError) {
    return <Text color="fg.error">Couldn&apos;t load your notifications. Please retry.</Text>;
  }

  const notifications = data.edges.map((edge) => edge.node);

  if (notifications.length === 0 && pages.page === 1) {
    return (
      <EmptyState
        title="No price drops yet"
        body="When a version you track gets cheaper at its shop, it's told here."
        cta={
          <Button asChild variant="outline" borderRadius="full">
            <NextLink href="/tracking">See what you track</NextLink>
          </Button>
        }
      />
    );
  }

  const turn = (target: PageTarget) => {
    pages.go(target, data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <Stack as="ul" gap="3">
        {notifications.map((notification) => (
          <Row key={notification.id} notification={notification} />
        ))}
      </Stack>

      <Paginator
        page={pages.page}
        totalPages={pageCount(data.totalCount, PAGE_SIZE)}
        hasPrevious={data.pageInfo.hasPreviousPage}
        hasNext={data.pageInfo.hasNextPage}
        busy={isPlaceholderData}
        onChange={turn}
      />
    </>
  );
}
