'use client';

import { Badge, Box, Button, Flex, Grid, HStack, Spinner, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import MobileMenu from '@/components/layout/mobile-menu';
import UserMenu from '@/components/layout/user-menu';
import { CartIcon, DiscIcon } from '@/components/ui/icons';
import { useMe } from '@/services/queries/auth/useMe';
import { useCart } from '@/services/queries/cart/useCart';
/**
 * Storefront banner. A client island over the (server-rendered) catalog:
 * - `useMe` decides the auth slot — Login link when logged out, the account
 *   dropdown (UserMenu) when logged in.
 * - the cart icon shows the server cart's item count, and links to /cart.
 *
 * The row is the logo, then the actions at the far end. On narrow screens the
 * account and cart collapse into a hamburger dropdown (MobileMenu).
 *
 * Sticks to the top over a translucent, blurred backdrop so cover art scrolls
 * beneath it rather than colliding with a solid bar. The outer element spans
 * the viewport; the inner grid is width-capped and centred.
 */
export default function Header() {
  const { data: user, isPending } = useMe();
  const { data: cart } = useCart();
  const cartCount = cart?.itemCount ?? 0;

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
      <Grid
        w="full"
        maxW="7xl"
        mx="auto"
        px={{ base: '4', md: '8' }}
        templateColumns="minmax(0, 1fr) auto"
        templateAreas='"logo actions"'
        alignItems="center"
        columnGap="4"
      >
        <HStack
          asChild
          gridArea="logo"
          h="14"
          gap="2.5"
          color="fg"
          _hover={{ color: 'brand.fg' }}
          transition="color 0.2s"
          justifySelf="start"
        >
          <NextLink href="/">
            <DiscIcon width="1.5em" height="1.5em" />
            <Text
              textStyle="display"
              fontSize={{ base: 'md', md: 'lg' }}
              letterSpacing="tightest"
              textTransform="uppercase"
            >
              Vinyl Order
            </Text>
          </NextLink>
        </HStack>

        <HStack gridArea="actions" gap="1" justifySelf="end" display={{ base: 'none', md: 'flex' }}>
          {isPending ? (
            <Spinner size="sm" color="fg.muted" />
          ) : user ? (
            <UserMenu user={user} />
          ) : (
            <Button asChild variant="ghost" size="sm" fontWeight="medium">
              <NextLink href="/login">Login</NextLink>
            </Button>
          )}

          <Button asChild variant="ghost" size="sm" position="relative" aria-label="Cart">
            <NextLink href="/cart">
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
            </NextLink>
          </Button>
        </HStack>

        <Box gridArea="actions" justifySelf="end" display={{ base: 'block', md: 'none' }}>
          <MobileMenu user={user} userPending={isPending} cartCount={cartCount} />
        </Box>
      </Grid>
    </Flex>
  );
}
