'use client';

import { clearCart } from '@/services/api/cart/mutations';
import { useCartWrite } from '@/services/queries/cart/use-cart-write';

/** Empty the cart. */
export const useClearCart = () => useCartWrite(() => clearCart());
