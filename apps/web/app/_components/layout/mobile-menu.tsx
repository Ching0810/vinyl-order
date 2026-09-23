'use client';

import { Badge, IconButton, Menu, Portal } from '@chakra-ui/react';
import type { PublicUser } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CloseIcon, MenuIcon } from '@/components/ui/icons';
import { useLogout } from '@/services/queries/auth/use-logout';
import { useCategories } from '@/services/queries/categories/use-categories';

/** Account section: the signed-in user's links and Logout, or Login when signed out. */
const AccountItems = ({ user }: { user: PublicUser | null | undefined }) => {
  const router = useRouter();
  const logoutMutation = useLogout();

  if (!user) {
    return (
      <Menu.Item value="login" asChild>
        <NextLink href="/login">Login</NextLink>
      </Menu.Item>
    );
  }

  const onLogout = () =>
    logoutMutation.mutate(undefined, {
      onSuccess: () => router.push('/'),
    });

  return (
    <Menu.ItemGroup>
      <Menu.ItemGroupLabel truncate>{user.name ?? user.email}</Menu.ItemGroupLabel>
      <Menu.Item value="orders" asChild>
        <NextLink href="/orders">Orders</NextLink>
      </Menu.Item>
      {user.role === 'admin' ? (
        <Menu.Item value="admin" asChild>
          <NextLink href="/admin/products">Admin</NextLink>
        </Menu.Item>
      ) : null}
      <Menu.Item value="logout" onClick={onLogout} disabled={logoutMutation.isPending}>
        Logout
      </Menu.Item>
    </Menu.ItemGroup>
  );
};
/**
 * The header's navigation on narrow screens: categories, cart and account
 * folded into one hamburger dropdown, since a phone-width row has no room for
 * the tabs beside the logo.
 *
 * Built on Chakra's Menu rather than a hand-rolled panel, so it gets focus
 * handling, arrow-key movement, Escape and outside-click to close, and closes
 * itself once an item is chosen. `open` is mirrored into state only to swap
 * the icon; Menu still owns the behaviour.
 *
 * The account section waits for `useMe` to settle, so a signed-in visitor
 * doesn't see Login flash up before their links.
 *
 * @param user - the signed-in user, or null/undefined when signed out
 * @param userPending - true while the session check is still in flight
 * @param cartCount - items in the cart, shown beside the Cart entry
 */
export default function MobileMenu({
  user,
  userPending,
  cartCount,
}: {
  user: PublicUser | null | undefined;
  userPending: boolean;
  cartCount: number;
}) {
  const [open, setOpen] = useState(false);
  const { data: categories } = useCategories();

  return (
    <Menu.Root
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: 'bottom-end' }}
    >
      <Menu.Trigger asChild>
        <IconButton aria-label="Menu" variant="ghost" size="sm">
          {open ? <CloseIcon /> : <MenuIcon />}
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="60" maxH="calc(100dvh - 5rem)" overflowY="auto">
            {categories && categories.length > 0 ? (
              <>
                <Menu.ItemGroup>
                  <Menu.ItemGroupLabel>Categories</Menu.ItemGroupLabel>
                  {categories.map((category) => (
                    <Menu.Item key={category.id} value={`category-${category.slug}`} asChild>
                      <NextLink href={`/products?category=${category.slug}`}>
                        {category.name}
                      </NextLink>
                    </Menu.Item>
                  ))}
                </Menu.ItemGroup>
                <Menu.Separator />
              </>
            ) : null}

            <Menu.Item value="cart" asChild>
              <NextLink href="/cart">
                Cart
                {cartCount > 0 ? (
                  <Badge ms="auto" borderRadius="full" colorPalette="brand" fontSize="2xs">
                    {cartCount}
                  </Badge>
                ) : null}
              </NextLink>
            </Menu.Item>

            {userPending ? null : (
              <>
                <Menu.Separator />
                <AccountItems user={user} />
              </>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
