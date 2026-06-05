'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { getQueryClient } from '@/lib/core/get-query-client';
import { chakraSystem } from '@/lib/ui/chakra-config';

/**
 * Client-side provider tree: React Query (server state) + Chakra UI (styling).
 * Kept in one place so layout.tsx stays a server component.
 */
export default function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={chakraSystem}>{children}</ChakraProvider>
    </QueryClientProvider>
  );
}
