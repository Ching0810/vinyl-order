import type { AddCartItemInput, Cart } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

// Every cart write returns the whole cart, so callers never need a follow-up
// read to refresh totals or the header badge.

/** POST /cart/items — adds, or increments an existing line. */
export const addCartItem = (input: AddCartItemInput): Promise<Cart> =>
  http.post<Cart>('/cart/items', input);

/** PATCH /cart/items/:offerId — sets an absolute quantity. */
export const updateCartItem = (offerId: string, quantity: number): Promise<Cart> =>
  http.patch<Cart>(`/cart/items/${offerId}`, { quantity });

/** DELETE /cart/items/:offerId — removes a line. */
export const removeCartItem = (offerId: string): Promise<Cart> =>
  http.delete<Cart>(`/cart/items/${offerId}`);

/** DELETE /cart — empties the cart. */
export const clearCart = (): Promise<Cart> => http.delete<Cart>('/cart');
