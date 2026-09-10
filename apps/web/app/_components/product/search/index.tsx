'use client';

import { Box, Button, Drawer, Input, InputGroup, Portal } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { SearchIcon } from '@/components/ui/icons';
import { useDebouncedValue } from '@/lib/core/use-debounced-value';
import { searchProducts } from '@/services/api/products/search';

import Results from './_components/results';

/**
 * Storefront search, with a different surface per breakpoint.
 *
 * Desktop (md+) keeps the input inline and floats results in a dropdown beneath
 * it. On a phone a dropdown would occupy most of the viewport while leaving the
 * page visible behind it, so the input becomes a button that opens a full-height
 * drawer where results get the whole screen.
 *
 * Both surfaces render together and are toggled with `display` rather than a
 * `useBreakpointValue` branch, because the latter resolves to a different value
 * on the server than in the browser and would hydrate mismatched.
 *
 * The query is debounced 500ms after the final keystroke, then React Query
 * fetches and caches it — so the two surfaces share one cache entry.
 */
const Search = () => {
  const [term, setTerm] = useState('');
  const [focused, setFocused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const q = useDebouncedValue(term.trim(), 500);

  const { data: results, isFetching } = useQuery({
    queryKey: ['products', 'search', q],
    queryFn: () => searchProducts(q),
    enabled: q.length > 0,
  });

  const dropdownOpen = focused && term.trim().length > 0;

  const inputProps = {
    value: term,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setTerm(event.target.value),
    placeholder: 'Search artist or title…',
    bg: 'bg.panel',
    color: 'fg',
    borderWidth: '1px',
    borderColor: 'border',
    _placeholder: { color: 'fg.subtle' },
  };

  return (
    <>
      <Box display={{ base: 'none', md: 'block' }} position="relative" w="full" maxW="lg">
        <InputGroup startElement={<SearchIcon />}>
          <Input
            {...inputProps}
            size="lg"
            borderRadius="full"
            onFocus={() => setFocused(true)}
            // Delayed so a click on a result isn't cut off by blur closing the list.
            onBlur={() => setTimeout(() => setFocused(false), 150)}
          />
        </InputGroup>

        {dropdownOpen ? (
          <Box
            position="absolute"
            top="100%"
            insetX="0"
            mt="2"
            zIndex="dropdown"
            bg="bg.panel"
            color="fg"
            borderWidth="1px"
            borderColor="border.muted"
            borderRadius="card"
            boxShadow="lift"
            maxH="96"
            overflowY="auto"
            overflowX="hidden"
          >
            <Results results={results} isFetching={isFetching} />
          </Box>
        ) : null}
      </Box>

      <Button
        display={{ base: 'flex', md: 'none' }}
        w="full"
        size="lg"
        justifyContent="start"
        borderRadius="full"
        bg="bg.panel"
        color="fg.subtle"
        fontWeight="normal"
        onClick={() => setDrawerOpen(true)}
      >
        <SearchIcon />
        Search artist or title…
      </Button>

      <Drawer.Root
        open={drawerOpen}
        onOpenChange={(event) => setDrawerOpen(event.open)}
        placement="bottom"
        size="full"
        initialFocusEl={() => document.getElementById('search-drawer-input')}
      >
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content bg="bg">
              <Drawer.Header borderBottomWidth="1px" borderColor="border.muted" gap="3">
                <InputGroup startElement={<SearchIcon />} flex="1">
                  <Input {...inputProps} id="search-drawer-input" borderRadius="full" />
                </InputGroup>
                <Drawer.CloseTrigger asChild position="static">
                  <Button variant="ghost" size="sm">
                    Cancel
                  </Button>
                </Drawer.CloseTrigger>
              </Drawer.Header>
              <Drawer.Body px="2" py="3">
                <Results results={results} isFetching={isFetching} />
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    </>
  );
};

export default Search;
