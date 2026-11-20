'use client';

import { Container } from '@chakra-ui/react';

import Hero from '@/components/home/hero';
import NewArrivals from '@/components/home/new-arrivals';
import Tracking from '@/components/home/tracking';
import PageShell from '@/components/layout/page-shell';
import GridSkeleton from '@/components/product/grid-skeleton';
import Search from '@/components/product/search';
import { useMe } from '@/services/queries/auth/useMe';

/**
 * Home (tracker.md §12.1): the hero, then the versions the signed-in user
 * tracks — or, for someone not signed in, the shops' new arrivals.
 */
export default function HomePage() {
  const { data: user, isPending } = useMe();

  const renderList = () => {
    if (isPending) return <GridSkeleton count={4} />;
    return user ? <Tracking /> : <NewArrivals />;
  };

  return (
    <PageShell>
      <Hero search={<Search />} />

      <Container maxW="7xl" px={{ base: '4', md: '8' }} py={{ base: '12', md: '20' }}>
        {renderList()}
      </Container>
    </PageShell>
  );
}
