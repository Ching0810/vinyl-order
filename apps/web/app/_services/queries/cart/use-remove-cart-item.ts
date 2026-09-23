'use client';

import { removeCartItem } from '@/services/api/cart/mutations';
import { useCartWrite } from '@/services/queries/cart/use-cart-write';

/** Remove a line from the cart. */
export const useRemoveCartItem = () => useCartWrite(removeCartItem);
