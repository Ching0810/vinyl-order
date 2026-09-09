'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { getQueryClient } from '@/lib/core/get-query-client';
import { chakraSystem } from '@/lib/ui/chakra-config';
import EmotionRegistry from '@/lib/ui/emotion-registry';

/**
 * Client-side provider tree: React Query (server state) + Chakra UI (styling).
 * Kept in one place so layout.tsx stays a server component.
 *
 * EmotionRegistry must wrap ChakraProvider: it supplies the Emotion cache that
 * Chakra's <Global> styles are inserted into, and moves them out of the SSR body
 * markup into <head> (see emotion-registry.tsx for why).
 */
export default function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <EmotionRegistry>
        <ChakraProvider value={chakraSystem}>{children}</ChakraProvider>
      </EmotionRegistry>
    </QueryClientProvider>
  );
}
