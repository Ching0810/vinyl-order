'use client';

import { updateCartItem } from '@/services/api/cart/mutations';
import { useCartWrite } from '@/services/queries/cart/useCartWrite';

/** Set a line's quantity — absolute, so a retry lands on the same number. */
export const useUpdateCartItem = () =>
  useCartWrite(({ catalogEntryId, quantity }: { catalogEntryId: string; quantity: number }) =>
    updateCartItem(catalogEntryId, quantity),
  );
