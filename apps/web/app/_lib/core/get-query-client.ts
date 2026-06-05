import { QueryClient } from '@tanstack/react-query';

const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        gcTime: 5 * 60 * 1000,
        staleTime: 1 * 60 * 1000,
      },
    },
  });

let browserQueryClient: QueryClient | undefined;

/**
 * A fresh QueryClient per request on the server (no cross-request leakage),
 * and a single shared instance reused across renders in the browser.
 */
export const getQueryClient = (): QueryClient => {
  if (typeof window === 'undefined') {
    return createQueryClient();
  }

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
};
