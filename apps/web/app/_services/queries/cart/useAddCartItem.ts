'use client';

import { addCartItem } from '@/services/api/cart/mutations';
import { useCartWrite } from '@/services/queries/cart/useCartWrite';

/** Add an offer to the cart, or increase it if the line already exists. */
export const useAddCartItem = () => useCartWrite(addCartItem);
