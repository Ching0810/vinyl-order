'use client';

import { Button, HStack, Skeleton } from '@chakra-ui/react';
import NextLink from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { useCategories } from '@/services/queries/categories/use-categories';

/** Shared frame so the loading, empty and loaded states occupy the same space. */
const Row = ({ children }: { children: React.ReactNode }) => (
  <HStack
    as="nav"
    aria-label="Categories"
    h="16"
    gap="1"
    overflowX="auto"
    css={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
  >
    {children}
  </HStack>
);

const Tabs = () => {
  const { data: categories, isPending } = useCategories();
  const pathname = usePathname();
  const active = useSearchParams().get('category');

  if (isPending) {
    return (
      <Row>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} h="5" w="14" mx="2" flexShrink="0" />
        ))}
      </Row>
    );
  }

  // Nothing curated yet — render nothing rather than an empty strip.
  if (!categories || categories.length === 0) return null;

  // Only highlight on the browse route: the same tab appearing active on a
  // product page would suggest you are still inside that listing.
  const onBrowse = pathname === '/products';

  return (
    <Row>
      {categories.map((category) => {
        const selected = onBrowse && active === category.slug;
        return (
          <Button
            key={category.id}
            asChild
            size="sm"
            variant={selected ? 'subtle' : 'ghost'}
            colorPalette={selected ? 'brand' : undefined}
            fontWeight={selected ? 'semibold' : 'medium'}
            flexShrink="0"
          >
            <NextLink href={`/products?category=${category.slug}`}>{category.name}</NextLink>
          </Button>
        );
      })}
    </Row>
  );
};

/**
 * Storefront category tabs, the header's primary navigation.
 *
 * There is no "All" tab: the store is browsed by category, the way a label
 * shop splits its catalogue by genre, so the tabs are the only way into a
 * listing.
 *
 * Tabs come from the API rather than a constant, which is the point of curated
 * categories: adding or reordering one is data, not a deploy. The row scrolls
 * horizontally when it runs out of room instead of wrapping, so the header
 * keeps a fixed height.
 *
 * `useSearchParams` opts a route into dynamic rendering unless it sits under a
 * Suspense boundary, so the boundary lives here rather than being something
 * every page that renders this has to remember.
 */
const CategoryNav = () => (
  <Suspense fallback={<Row>{null}</Row>}>
    <Tabs />
  </Suspense>
);

export default CategoryNav;
