'use client';

import { Checkbox, HStack, Input, InputGroup, NativeSelect, Stack } from '@chakra-ui/react';
import type { Supplier } from '@vinyl-order/shared';

import { SearchIcon } from '@/components/ui/icons';
import { CATALOG_SHOPS, type CatalogSearchState } from '@/lib/utils/catalog-search';
import { SUPPLIER_LABEL } from '@/lib/utils/supplier-order';

/**
 * The search box, the shop to search, and whether used records and other
 * goods (CDs, books) count — new vinyl only unless asked (tracker.md §7.2).
 *
 * @param words - the box's text, as typed
 * @param onWordsChange - called on each keystroke
 * @param search - the search as the URL holds it, for the filters
 * @param onChange - called with the search when a filter changes
 */
export default function SearchControls({
  words,
  onWordsChange,
  search,
  onChange,
}: {
  words: string;
  onWordsChange: (words: string) => void;
  search: CatalogSearchState;
  onChange: (search: CatalogSearchState) => void;
}) {
  return (
    <Stack gap="3" mb="6">
      <InputGroup startElement={<SearchIcon />}>
        <Input
          value={words}
          onChange={(event) => onWordsChange(event.target.value)}
          placeholder="Artist or title, in any language the shops write it…"
          size="lg"
          borderRadius="full"
          autoFocus
        />
      </InputGroup>
      <HStack gap="5" wrap="wrap">
        <NativeSelect.Root size="sm" width="auto">
          <NativeSelect.Field
            aria-label="Shop"
            value={search.supplier ?? ''}
            onChange={(event) =>
              onChange({
                ...search,
                supplier: CATALOG_SHOPS.find((shop: Supplier) => shop === event.target.value),
              })
            }
          >
            <option value="">All shops</option>
            {CATALOG_SHOPS.map((shop) => (
              <option key={shop} value={shop}>
                {SUPPLIER_LABEL[shop]}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Checkbox.Root
          size="sm"
          checked={search.used}
          onCheckedChange={(details) => onChange({ ...search, used: details.checked === true })}
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label>Used records</Checkbox.Label>
        </Checkbox.Root>
        <Checkbox.Root
          size="sm"
          checked={search.nonVinyl}
          onCheckedChange={(details) => onChange({ ...search, nonVinyl: details.checked === true })}
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label>CDs and other goods</Checkbox.Label>
        </Checkbox.Root>
      </HStack>
    </Stack>
  );
}
