import type { Product } from '@vinyl-order/shared';
import { create } from 'zustand';

/** One line in the cart: a product plus how many copies. */
export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
}

/**
 * Client-only cart state. Browser-side for now (no persistence/checkout yet) —
 * the header reads the count, and add-to-cart UI will call `addItem` later.
 */
export const useCart = create<CartState>((set) => {
  return {
    items: [],
    addItem: (product) =>
      set((state) => {
        const existing = state.items.find((item) => item.product.id === product.id);
        if (existing) {
          return {
            items: state.items.map((item) =>
              item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
            ),
          };
        }
        return { items: [...state.items, { product, quantity: 1 }] };
      }),
    removeItem: (productId) =>
      set((state) => {
        return { items: state.items.filter((item) => item.product.id !== productId) };
      }),
    clear: () => set({ items: [] }),
  };
});

/** Total item count (sum of quantities) — for the header badge. */
export const useCartCount = (): number =>
  useCart((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
