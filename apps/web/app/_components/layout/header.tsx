'use client';

import { Badge, Button, Flex, HStack, Spinner, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import UserMenu from '@/components/layout/user-menu';
import { CartIcon, DiscIcon } from '@/components/ui/icons';
import { useMe } from '@/services/queries/auth/use-me';
import { useCartCount } from '@/store/cart';

/**
 * Storefront banner. A client island over the (server-rendered) catalog:
 * - `useMe` decides the auth slot — Login link when logged out, the account
 *   dropdown (UserMenu) when logged in.
 * - the cart icon shows the live count from the zustand store.
 *
 * Sticks to the top over a translucent, blurred backdrop so cover art scrolls
 * beneath it rather than colliding with a solid bar. The outer element spans
 * the viewport; the inner row is width-capped and centred.
 */
const Header = () => {
  const { data: user, isPending } = useMe();
  const cartCount = useCartCount();

  return (
    <Flex
      as="header"
      direction="column"
      position="sticky"
      top="0"
      zIndex="docked"
      borderBottomWidth="1px"
      borderColor="border.muted"
      bg="bg/80"
      backdropFilter="saturate(180%) blur(12px)"
    >
      <Flex
        w="full"
        maxW="7xl"
        mx="auto"
        px={{ base: '4', md: '8' }}
        h={{ base: '14', md: '16' }}
        align="center"
        gap="4"
      >
        <NextLink href="/">
          <HStack gap="2.5" color="fg" _hover={{ color: 'brand.fg' }} transition="color 0.2s">
            <DiscIcon width="1.5em" height="1.5em" />
            <Text
              textStyle="display"
              fontSize={{ base: 'md', md: 'lg' }}
              letterSpacing="tightest"
              textTransform="uppercase"
            >
              Vinyl Order
            </Text>
          </HStack>
        </NextLink>

        <HStack as="nav" gap="1" ms={{ base: '2', md: '8' }}>
          <Button asChild variant="ghost" size="sm" fontWeight="medium">
            <NextLink href="/products">Shop</NextLink>
          </Button>
        </HStack>

        <HStack gap="1" ms="auto">
          {isPending ? (
            <Spinner size="sm" color="fg.muted" />
          ) : user ? (
            <UserMenu user={user} />
          ) : (
            <Button asChild variant="ghost" size="sm" fontWeight="medium">
              <NextLink href="/login">Login</NextLink>
            </Button>
          )}

          <Button variant="ghost" size="sm" position="relative" aria-label="Cart">
            <CartIcon />
            {cartCount > 0 ? (
              <Badge
                position="absolute"
                top="0"
                insetEnd="0"
                borderRadius="full"
                colorPalette="brand"
                fontSize="2xs"
              >
                {cartCount}
              </Badge>
            ) : null}
          </Button>
        </HStack>
      </Flex>
    </Flex>
  );
};

export default Header;
