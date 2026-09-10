'use client';

import { Container, Flex, Skeleton, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';

import PageShell from '@/components/layout/page-shell';
import Detail from '@/components/product/detail';
import { HttpError } from '@/lib/core/http';
import { useProduct } from '@/services/queries/products/use-product';

/** Placeholder matching the detail layout so nothing shifts when data lands. */
const DetailSkeleton = () => (
  <Flex direction={{ base: 'column', md: 'row' }} gap={{ base: '8', md: '14' }}>
    <Skeleton
      flexShrink="0"
      w={{ base: 'full', md: '420px' }}
      aspectRatio="1"
      borderRadius="card"
    />
    <Stack gap="5" flex="1" pt="2">
      <Skeleton h="3" w="32" />
      <Skeleton h="12" w="70%" />
      <Skeleton h="6" w="50%" />
      <Skeleton h="8" w="40" mt="4" />
      <Skeleton h="12" w="44" borderRadius="full" />
    </Stack>
  </Flex>
);

const ProductDetailPage = () => {
  const params = useParams<{ id: string }>();
  const { data: product, isPending, error } = useProduct(params.id);

  const notFound = error instanceof HttpError && error.status === 404;

  const renderBody = () => {
    if (isPending) return <DetailSkeleton />;

    if (notFound) {
      return (
        <Stack gap="4" py="16" align="start">
          <Text textStyle="eyebrow" color="fg.muted">
            404
          </Text>
          <Text fontSize="xl" fontWeight="semibold">
            We couldn&apos;t find that record.
          </Text>
          <Text color="fg.muted">
            It may have sold out and been removed.{' '}
            <NextLink href="/" style={{ textDecoration: 'underline' }}>
              Back to the shop
            </NextLink>
          </Text>
        </Stack>
      );
    }

    if (error || !product) {
      return (
        <Text color="fg.error" py="16">
          Couldn&apos;t load this record. Please retry.
        </Text>
      );
    }

    return <Detail product={product} />;
  };

  return (
    <PageShell>
      <Container maxW="7xl" px={{ base: '4', md: '8' }} py={{ base: '8', md: '14' }}>
        {renderBody()}
      </Container>
    </PageShell>
  );
};

export default ProductDetailPage;
