'use client';

import { HStack, Portal, Select, Text, createListCollection } from '@chakra-ui/react';

import { type Facet, facetLabel, orderCount } from './facet';

/**
 * One facet as plain text with a chevron, opening its choices under it.
 * Bold once narrowed, so a filtered list reads as filtered.
 */
const FacetSelect = ({ facet, onChange }: { facet: Facet; onChange: (value: string) => void }) => {
  const collection = createListCollection({ items: facet.choices });
  const narrowed = facet.value !== 'all';

  return (
    <Select.Root
      collection={collection}
      value={[facet.value]}
      onValueChange={({ value: [next] }) => onChange(next)}
      positioning={{ sameWidth: false, placement: 'bottom-start' }}
      w="auto"
    >
      <Select.HiddenSelect aria-label={facet.name} />
      <Select.Control>
        <Select.Trigger
          gap="1"
          px="0"
          minH="0"
          h="auto"
          border="none"
          bg="transparent"
          color="gray.900"
          fontWeight={narrowed ? 'semibold' : 'normal'}
          cursor="pointer"
          aria-label={facet.name}
        >
          {facetLabel(facet)}
          <Select.Indicator position="static" transform="none" color="gray.600" />
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content minW="52" p="2" borderRadius="xl" bg="white" shadow="lg">
            {facet.choices.map((choice) => (
              <Select.Item
                key={choice.value}
                item={choice}
                px="3"
                py="2"
                gap="3"
                borderRadius="lg"
                fontSize="sm"
                color="gray.800"
                cursor="pointer"
                _highlighted={{ bg: 'gray.100' }}
                _checked={{ fontWeight: 'semibold', color: 'gray.900' }}
              >
                <Select.ItemText flex="1">{choice.label}</Select.ItemText>
                {choice.count === undefined ? null : (
                  <Text as="span" fontSize="xs" color="gray.500">
                    {choice.count}
                  </Text>
                )}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
};

/**
 * The filters on a wide screen, as a record shop's catalogue lays them out:
 * "Filter:" then each facet as a text dropdown, and how many orders show at
 * the far end.
 *
 * A choice applies at once.
 *
 * @param facets - the ways the list can be filtered
 * @param shown - how many orders the filters leave
 * @param onChange - called with a facet's key and its new choice
 */
export default function InlineFilters({
  facets,
  shown,
  onChange,
}: {
  facets: Facet[];
  shown: number;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <HStack gap="6" w="full">
      <Text color="gray.600">Filter:</Text>
      {facets.map((facet) => (
        <FacetSelect
          key={facet.key}
          facet={facet}
          onChange={(value) => onChange(facet.key, value)}
        />
      ))}
      <Text ms="auto" color="gray.600">
        {orderCount(shown)}
      </Text>
    </HStack>
  );
}
