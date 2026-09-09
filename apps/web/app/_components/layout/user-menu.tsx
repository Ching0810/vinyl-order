'use client';

import { Badge, Box, Button, Menu, Portal, Text } from '@chakra-ui/react';
import type { PublicUser } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';

import { UserIcon } from '@/components/ui/icons';
import { useLogout } from '@/services/queries/auth/use-logout';

/**
 * Logged-in account dropdown: the trigger shows the user's name; the menu holds
 * their identity + role, navigation (Account, Admin for admins), and Logout.
 */
const UserMenu = ({ user }: { user: PublicUser }) => {
  const router = useRouter();
  const logoutMutation = useLogout();

  const onLogout = () =>
    logoutMutation.mutate(undefined, {
      onSuccess: () => router.push('/'),
    });

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="ghost">
          <UserIcon />
          {user.name ?? user.email}
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="48">
            <Box px="3" py="2">
              <Text fontWeight="medium" truncate>
                {user.name ?? user.email}
              </Text>
              <Badge mt="1" colorPalette={user.role === 'admin' ? 'purple' : 'gray'}>
                {user.role}
              </Badge>
            </Box>

            <Menu.Separator />

            <Menu.Item value="account" asChild>
              <NextLink href="/account">Account</NextLink>
            </Menu.Item>
            {user.role === 'admin' ? (
              <Menu.Item value="admin" asChild>
                <NextLink href="/admin/products">Admin</NextLink>
              </Menu.Item>
            ) : null}

            <Menu.Separator />

            <Menu.Item value="logout" onClick={onLogout} disabled={logoutMutation.isPending}>
              Logout
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

export default UserMenu;
