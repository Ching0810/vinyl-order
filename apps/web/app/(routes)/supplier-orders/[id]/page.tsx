'use client';

import { Container, Link } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';

import PageShell from '@/components/layout/page-shell';
import SupplierOrderDetail from '@/components/supplier-order/detail';
import { ChevronLeftIcon } from '@/components/ui/icons';

/** `/supplier-orders/[id]` — one order, with all that its card leaves out. */
export default function SupplierOrderPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <PageShell>
      <Container maxW="3xl" px={{ base: '4', md: '8' }} py={{ base: '6', md: '10' }}>
        <Link asChild fontSize="sm" color="fg.muted" mb="6" _hover={{ color: 'fg' }}>
          <NextLink href="/supplier-orders">
            <ChevronLeftIcon />
            Supplier orders
          </NextLink>
        </Link>
        <SupplierOrderDetail id={id} />
      </Container>
    </PageShell>
  );
}
