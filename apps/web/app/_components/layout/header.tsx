'use client';

import { Badge, Button, Flex, HStack, Spinner, chakra } from '@chakra-ui/react';
import NextLink from 'next/link';

import { CartIcon, UserIcon } from '@/components/icons';
import { useMe } from '@/services/queries/auth/use-me';
import { useCartCount } from '@/store/cart';

/**
 * Storefront banner. A client island over the (server-rendered) catalog:
 * - `useMe` decides the auth slot — Login link when logged out, a user button
 *   linking to /account when logged in.
 * - cart icon shows the live count from the zustand store.
 */
const Header = () => {
  const { data: user, isPending } = useMe();
  const cartCount = useCartCount();

  return (
    <chakra.header borderBottomWidth="1px" position="sticky" top="0" bg="bg" zIndex="docked">
      <Flex maxW="6xl" mx="auto" px="4" h="16" align="center" justify="space-between">
        <Button asChild variant="ghost" fontWeight="bold" fontSize="lg">
          <NextLink href="/">Vinyl Order</NextLink>
        </Button>

        <HStack gap="1">
          {isPending ? (
            <Spinner size="sm" />
          ) : user ? (
            <Button asChild variant="ghost">
              <NextLink href="/account">
                <UserIcon />
                {user.name ?? user.email}
              </NextLink>
            </Button>
          ) : (
            <Button asChild variant="ghost">
              <NextLink href="/login">Login</NextLink>
            </Button>
          )}

          <Button variant="ghost" position="relative" aria-label="Cart">
            <CartIcon />
            {cartCount > 0 ? (
              <Badge
                position="absolute"
                top="1"
                insetEnd="1"
                borderRadius="full"
                colorPalette="red"
              >
                {cartCount}
              </Badge>
            ) : null}
          </Button>
        </HStack>
      </Flex>
    </chakra.header>
  );
};

export default Header;
