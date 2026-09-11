'use client';

import { Button, Flex, HStack } from '@chakra-ui/react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';

/** Admin destinations, in the order they appear. */
const LINKS = [
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/products/new', label: 'Add product' },
  { href: '/admin/hero', label: 'Hero carousel' },
  { href: '/admin/categories', label: 'Categories' },
];

/**
 * Sub-navigation for the admin area, sitting under the storefront header.
 *
 * Replaces the ad-hoc "Back" / "Store" buttons that each admin page used to
 * carry: a consistent bar means the same destinations sit in the same place on
 * every screen, and the current section is always marked.
 */
const AdminNav = () => {
  const pathname = usePathname();

  return (
    <Flex
      borderBottomWidth="1px"
      borderColor="border.muted"
      bg="bg.subtle"
      px={{ base: '4', md: '8' }}
    >
      <HStack w="full" maxW="7xl" mx="auto" h="12" gap="1" justify="space-between">
        <HStack gap="1">
          {LINKS.map((link) => {
            // Exact match only — /admin/products must not light up while the
            // nested "Add product" route is open.
            const active = pathname === link.href;
            return (
              <Button
                key={link.href}
                asChild
                size="sm"
                variant={active ? 'subtle' : 'ghost'}
                fontWeight={active ? 'semibold' : 'normal'}
                colorPalette={active ? 'brand' : undefined}
              >
                <NextLink href={link.href}>{link.label}</NextLink>
              </Button>
            );
          })}
        </HStack>

        <Button asChild size="sm" variant="ghost" color="fg.muted">
          <NextLink href="/">View store</NextLink>
        </Button>
      </HStack>
    </Flex>
  );
};

export default AdminNav;
