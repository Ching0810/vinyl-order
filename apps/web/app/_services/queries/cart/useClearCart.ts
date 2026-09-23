'use client';

import { clearCart } from '@/services/api/cart/mutations';
import { useCartWrite } from '@/services/queries/cart/useCartWrite';

/** Empty the cart. */
export const useClearCart = () => useCartWrite(() => clearCart());
