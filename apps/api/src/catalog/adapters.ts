import type { Supplier } from '@vinyl-order/shared';

import { COSMIC, EasyStoreAdapter, THT } from './easystore-adapter';
import { ROTTEN_BLUES, ShopifyAdapter } from './shopify-adapter';
import type { SupplierAdapter } from './supplier-adapter';

/** The shops an adapter reads; Candlelight comes with step 11. */
export type SupplierAdapters = Partial<Record<Supplier, SupplierAdapter>>;

/** Injection token for the adapters; tests replace them with fakes. */
export const SUPPLIER_ADAPTERS = Symbol('SUPPLIER_ADAPTERS');

/**
 * One adapter per shop, each with its own ShopFetcher. Made once per process:
 * a fetcher queues its requests per host and pauses between them (§6.4), and
 * that holds only if every request to a shop goes through the same one.
 */
export const createSupplierAdapters = (): SupplierAdapters => ({
  tht: new EasyStoreAdapter(THT),
  cosmic: new EasyStoreAdapter(COSMIC),
  rotten_blues: new ShopifyAdapter(ROTTEN_BLUES),
});
