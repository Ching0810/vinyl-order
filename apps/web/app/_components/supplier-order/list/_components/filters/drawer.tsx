'use client';

import { Button, Drawer, HStack, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { useState } from 'react';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CloseIcon,
  FilterIcon,
} from '@/components/ui/icons';

import { type Facet, type FilterValues, chosen, orderCount } from './facet';

/** A full-width row of the drawer: label on the left, the rest at the right. */
const ROW_STYLES = {
  w: 'full',
  h: '14',
  px: '4',
  justifyContent: 'space-between',
  borderRadius: '0',
  fontSize: 'md',
  fontWeight: 'normal',
  color: 'gray.900',
} as const;

/** The facets, each a row showing its choice and leading into its options. */
const FacetRows = ({ facets, onOpen }: { facets: Facet[]; onOpen: (key: string) => void }) => (
  <Stack gap="0">
    {facets.map((facet) => (
      <Button key={facet.key} variant="ghost" onClick={() => onOpen(facet.key)} {...ROW_STYLES}>
        {facet.name}
        <HStack gap="3" color="gray.600" fontSize="sm">
          {chosen(facet).label}
          <ArrowRightIcon />
        </HStack>
      </Button>
    ))}
  </Stack>
);

/** One facet's options; choosing one marks it and goes back to the facets. */
const FacetOptions = ({
  facet,
  onChoose,
  onBack,
}: {
  facet: Facet;
  onChoose: (value: string) => void;
  onBack: () => void;
}) => (
  <Stack gap="0">
    <Button
      variant="ghost"
      onClick={onBack}
      {...ROW_STYLES}
      justifyContent="start"
      gap="3"
      fontWeight="semibold"
    >
      <ArrowLeftIcon />
      {facet.name}
    </Button>
    {facet.choices.map((choice) => {
      const selected = choice.value === facet.value;
      return (
        <Button
          key={choice.value}
          variant="ghost"
          onClick={() => onChoose(choice.value)}
          {...ROW_STYLES}
          fontWeight={selected ? 'semibold' : 'normal'}
        >
          {choice.label}
          <HStack gap="3" color="gray.600" fontSize="sm">
            {choice.count === undefined ? null : choice.count}
            {selected ? (
              <chakra.span color="gray.900">
                <CheckCircleIcon />
              </chakra.span>
            ) : null}
          </HStack>
        </Button>
      );
    })}
  </Stack>
);

/**
 * The filters on a phone, as a record shop's catalogue does them: one row,
 * "Filter" at the left and how many orders show at the right, opening a
 * drawer from the side. There each facet is a row showing its choice, and
 * leads into its options.
 *
 * Choices are a draft until "Apply", which applies them and closes the
 * drawer; "Remove all" clears every filter and closes it. Closing any other
 * way drops the draft. The counts follow the draft, so they say what Apply
 * would show.
 *
 * @param applied - the filters the list shows now
 * @param facetsFor - the facets for a set of choices, with counts
 * @param shownFor - how many orders a set of choices leaves
 * @param onApply - called with the choices to apply
 */
export default function DrawerFilters({
  applied,
  facetsFor,
  shownFor,
  onApply,
}: {
  applied: FilterValues;
  facetsFor: (values: FilterValues) => Facet[];
  shownFor: (values: FilterValues) => number;
  onApply: (values: FilterValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterValues>(applied);
  // Which facet's options are showing; null for the list of facets.
  const [openFacet, setOpenFacet] = useState<string | null>(null);

  const facets = facetsFor(draft);
  const facet = facets.find((candidate) => candidate.key === openFacet);
  const narrowed = Object.values(applied).filter((value) => value !== 'all').length;

  const openDrawer = () => {
    setDraft(applied);
    setOpenFacet(null);
    setOpen(true);
  };

  const apply = (values: FilterValues) => {
    onApply(values);
    setOpen(false);
  };

  const removeAll = () =>
    apply(Object.fromEntries(Object.keys(applied).map((key) => [key, 'all'])));

  return (
    <>
      <HStack w="full" justify="space-between">
        <Button
          variant="ghost"
          px="0"
          gap="2"
          fontSize="md"
          fontWeight="normal"
          color="gray.900"
          onClick={openDrawer}
        >
          <FilterIcon />
          Filter{narrowed > 0 ? ` (${narrowed})` : ''}
        </Button>
        <Text color="gray.600">{orderCount(shownFor(applied))}</Text>
      </HStack>

      <Drawer.Root
        open={open}
        onOpenChange={(event) => setOpen(event.open)}
        placement="start"
        size="sm"
      >
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content bg="white">
              <Drawer.Header borderBottomWidth="1px" borderColor="gray.200" px="4" py="3">
                <Stack gap="0.5" flex="1" textAlign="center">
                  <Drawer.Title fontSize="md">Filter</Drawer.Title>
                  <Text fontSize="sm" color="gray.600">
                    {orderCount(shownFor(draft))}
                  </Text>
                </Stack>
                <Drawer.CloseTrigger asChild position="absolute" top="2" right="2">
                  <Button variant="ghost" size="sm" aria-label="Close">
                    <CloseIcon />
                  </Button>
                </Drawer.CloseTrigger>
              </Drawer.Header>

              <Drawer.Body px="0" py="2">
                {facet ? (
                  <FacetOptions
                    facet={facet}
                    onChoose={(value) => {
                      setDraft({ ...draft, [facet.key]: value });
                      setOpenFacet(null);
                    }}
                    onBack={() => setOpenFacet(null)}
                  />
                ) : (
                  <FacetRows facets={facets} onOpen={setOpenFacet} />
                )}
              </Drawer.Body>

              <Drawer.Footer gap="3" px="4" py="3" borderTopWidth="1px" borderColor="gray.200">
                <Button
                  flex="1"
                  variant="outline"
                  borderRadius="full"
                  borderColor="gray.300"
                  color="gray.900"
                  onClick={removeAll}
                >
                  Remove all
                </Button>
                <Button
                  flex="1"
                  colorPalette="gray"
                  borderRadius="full"
                  onClick={() => apply(draft)}
                >
                  Apply
                </Button>
              </Drawer.Footer>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    </>
  );
}
