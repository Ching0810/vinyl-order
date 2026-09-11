import type { AddCartItemInput, Cart } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

// Every cart write returns the whole cart, so callers never need a follow-up
// read to refresh totals or the header badge.

/** POST /cart/items — adds, or increments an existing line. */
export const addCartItem = (input: AddCartItemInput): Promise<Cart> =>
  http.post<Cart>('/cart/items', input);

/** PATCH /cart/items/:productId — sets an absolute quantity. */
export const updateCartItem = (productId: string, quantity: number): Promise<Cart> =>
  http.patch<Cart>(`/cart/items/${productId}`, { quantity });

/** DELETE /cart/items/:productId — removes a line. */
export const removeCartItem = (productId: string): Promise<Cart> =>
  http.delete<Cart>(`/cart/items/${productId}`);

/** DELETE /cart — empties the cart. */
export const clearCart = (): Promise<Cart> => http.delete<Cart>('/cart');
