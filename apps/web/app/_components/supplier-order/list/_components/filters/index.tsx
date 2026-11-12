'use client';

import { Box } from '@chakra-ui/react';
import { type SupplierOrder, supplierSchema } from '@vinyl-order/shared';

import {
  STATUS_FILTERS,
  SUPPLIER_LABEL,
  type StatusFilter,
  type SupplierFilter,
  countOrders,
  toStatusFilter,
  toSupplierFilter,
} from '@/lib/utils/supplier-order';

import DrawerFilters from './drawer';
import type { Facet, FilterValues } from './facet';
import InlineFilters from './inline';

/**
 * The list's filters — where orders stand, and which shop — laid out as a
 * record shop's catalogue does: a row of text dropdowns on a wide screen,
 * a "Filter" button opening a side drawer on a phone. Both are rendered and
 * switched with `display` (see product/search). Held under the site header
 * while the list scrolls, so they stay in reach.
 *
 * The desktop row applies a choice at once; the drawer holds its choices
 * until "Apply", so it counts against those choices, not the applied ones.
 *
 * @param orders - the user's orders, for the counts
 * @param status - the chosen status filter
 * @param supplier - the chosen shop
 * @param onChange - called with both filters when they change
 */
export default function SupplierOrderFilters({
  orders,
  status,
  supplier,
  onChange,
}: {
  orders: SupplierOrder[];
  status: StatusFilter;
  supplier: SupplierFilter;
  onChange: (next: { status: StatusFilter; supplier: SupplierFilter }) => void;
}) {
  const applied: FilterValues = { status, shop: supplier };

  /** The facets as they stand for some choices, each choice counted. */
  const facetsFor = (values: FilterValues): Facet[] => {
    const shop = toSupplierFilter(values.shop);
    return [
      {
        key: 'status',
        name: 'Status',
        value: values.status,
        choices: STATUS_FILTERS.map(({ value, label }) => {
          return { value, label, count: countOrders(orders, value, shop) };
        }),
      },
      {
        key: 'shop',
        name: 'Shop',
        value: values.shop,
        choices: [
          { value: 'all', label: 'All shops' },
          ...supplierSchema.options.map((value) => {
            return { value, label: SUPPLIER_LABEL[value] };
          }),
        ],
      },
    ];
  };

  const shownFor = (values: FilterValues): number =>
    countOrders(orders, toStatusFilter(values.status), toSupplierFilter(values.shop));

  const apply = (values: FilterValues) =>
    onChange({ status: toStatusFilter(values.status), supplier: toSupplierFilter(values.shop) });

  return (
    // Out to the container's edges with the page's colour behind, so cards
    // pass under it cleanly; the site header is one 3.5rem row and its 1px
    // border.
    <Box
      position="sticky"
      top="calc(3.5rem + 1px)"
      zIndex="1"
      mx={{ base: '-4', md: '-8' }}
      px={{ base: '4', md: '8' }}
      py="3"
      // The page heading above already ends in a wide margin; pull up by
      // the row's own top padding, which is only there for when it sticks.
      mt="-3"
      mb="3"
      bg="bg"
    >
      <Box display={{ base: 'none', md: 'block' }}>
        <InlineFilters
          facets={facetsFor(applied)}
          shown={shownFor(applied)}
          onChange={(key, value) => apply({ ...applied, [key]: value })}
        />
      </Box>
      <Box display={{ base: 'block', md: 'none' }}>
        <DrawerFilters
          applied={applied}
          facetsFor={facetsFor}
          shownFor={shownFor}
          onApply={apply}
        />
      </Box>
    </Box>
  );
}
