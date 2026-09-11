'use client';

import { Button, Flex, HStack, Skeleton } from '@chakra-ui/react';
import NextLink from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { useCategories } from '@/services/queries/categories/use-categories';

/** Shared frame so the loading, empty and loaded states occupy the same space. */
const Bar = ({ children }: { children: React.ReactNode }) => (
  <Flex
    borderBottomWidth="1px"
    borderColor="border.muted"
    bg="bg"
    px={{ base: '4', md: '8' }}
    overflowX="auto"
    css={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
  >
    <HStack w="full" maxW="7xl" mx="auto" h="12" gap="1" flexShrink="0">
      {children}
    </HStack>
  </Flex>
);

const Tabs = () => {
  const { data: categories, isPending } = useCategories();
  const pathname = usePathname();
  const active = useSearchParams().get('category');

  if (isPending) {
    return (
      <Bar>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} h="5" w="14" mx="2" />
        ))}
      </Bar>
    );
  }

  // Nothing curated yet — render no bar rather than an empty strip.
  if (!categories || categories.length === 0) return null;

  const onBrowse = pathname === '/products';

  return (
    <Bar>
      <Button
        asChild
        size="sm"
        variant={onBrowse && !active ? 'subtle' : 'ghost'}
        colorPalette={onBrowse && !active ? 'brand' : undefined}
        fontWeight={onBrowse && !active ? 'semibold' : 'normal'}
        flexShrink="0"
      >
        <NextLink href="/products">All</NextLink>
      </Button>

      {categories.map((category) => {
        // Only highlight on the browse route: the same tab appearing active on
        // a product page would suggest you are still inside that listing.
        const selected = onBrowse && active === category.slug;
        return (
          <Button
            key={category.id}
            asChild
            size="sm"
            variant={selected ? 'subtle' : 'ghost'}
            colorPalette={selected ? 'brand' : undefined}
            fontWeight={selected ? 'semibold' : 'normal'}
            flexShrink="0"
          >
            <NextLink href={`/products?category=${category.slug}`}>{category.name}</NextLink>
          </Button>
        );
      })}
    </Bar>
  );
};

/**
 * Storefront category tabs, sitting under the header.
 *
 * Tabs come from the API rather than a constant, which is the point of curated
 * categories: adding or reordering one is data, not a deploy. The bar scrolls
 * horizontally on narrow screens instead of wrapping, so the header keeps a
 * fixed height.
 *
 * `useSearchParams` opts a route into dynamic rendering unless it sits under a
 * Suspense boundary, so the boundary lives here rather than being something
 * every page that renders this has to remember.
 */
const CategoryNav = () => (
  <Suspense fallback={<Bar>{null}</Bar>}>
    <Tabs />
  </Suspense>
);

export default CategoryNav;
