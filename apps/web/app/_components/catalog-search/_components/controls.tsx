'use client';

import {
  Button,
  Checkbox,
  HStack,
  Input,
  InputGroup,
  Portal,
  Select,
  Stack,
  createListCollection,
} from '@chakra-ui/react';
import { useRef } from 'react';

import { CloseIcon, SearchIcon } from '@/components/ui/icons';
import { CATALOG_SHOPS, type CatalogSearchState } from '@/lib/utils/catalog-search';
import { SUPPLIER_LABEL } from '@/lib/utils/supplier-order';

/** "All shops", then each shop with a catalog; "" stands for all. */
const SHOP_CHOICES = createListCollection({
  items: [
    { value: '', label: 'All shops' },
    ...CATALOG_SHOPS.map((shop) => {
      return { value: shop, label: SUPPLIER_LABEL[shop] };
    }),
  ],
});

/**
 * The search box, the shop to search, and whether used records and other
 * goods (CDs, books) count — new vinyl only unless asked (tracker.md §7.2).
 *
 * The shop picker is the page's own dropdown, placed under its trigger, not
 * the browser's: a native select's list is drawn by the browser, which put it
 * away from the field in a docked or zoomed window.
 *
 * @param words - the box's text, as typed
 * @param onWordsChange - called on each keystroke, and with "" when cleared
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
  // Cleared by the button, the box keeps the focus for the next words.
  const input = useRef<HTMLInputElement>(null);

  return (
    <Stack gap="3" mb="6">
      <InputGroup
        startElement={<SearchIcon />}
        endElement={
          words ? (
            <Button
              variant="ghost"
              size="xs"
              borderRadius="full"
              aria-label="Clear the search"
              onClick={() => {
                onWordsChange('');
                input.current?.focus();
              }}
            >
              <CloseIcon />
            </Button>
          ) : null
        }
      >
        <Input
          ref={input}
          value={words}
          onChange={(event) => onWordsChange(event.target.value)}
          placeholder="Artist or title, in any language the shops write it…"
          size="lg"
          borderRadius="full"
          autoFocus
        />
      </InputGroup>
      <HStack gap="5" wrap="wrap">
        <Select.Root
          collection={SHOP_CHOICES}
          size="sm"
          width="auto"
          value={[search.supplier ?? '']}
          onValueChange={({ value: [next] }) =>
            onChange({ ...search, supplier: CATALOG_SHOPS.find((shop) => shop === next) })
          }
          positioning={{ sameWidth: false, placement: 'bottom-start' }}
        >
          <Select.HiddenSelect aria-label="Shop" />
          <Select.Control>
            <Select.Trigger minW="32">
              <Select.ValueText />
            </Select.Trigger>
            <Select.IndicatorGroup>
              <Select.Indicator />
            </Select.IndicatorGroup>
          </Select.Control>
          <Portal>
            <Select.Positioner>
              <Select.Content>
                {SHOP_CHOICES.items.map((choice) => (
                  <Select.Item key={choice.value} item={choice}>
                    <Select.ItemText>{choice.label}</Select.ItemText>
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Portal>
        </Select.Root>
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
