'use client';

import { Button, HStack, Image, Input, Stack, Text } from '@chakra-ui/react';
import type { DiscogsLookupResult } from '@vinyl-order/shared';
import { useState } from 'react';

import { useDiscogsSearch } from '@/services/queries/admin/use-discogs-search';

/**
 * Discogs import panel for the product form: search releases, then click one to
 * prefill the form via `onPick`. Owns its own search box state + query, so the
 * parent form only deals with the chosen result.
 */
const DiscogsImport = ({ onPick }: { onPick: (result: DiscogsLookupResult) => void }) => {
  const [query, setQuery] = useState('');
  const searchMutation = useDiscogsSearch();

  const runSearch = () => {
    if (query.trim()) searchMutation.mutate(query.trim());
  };

  return (
    <Stack gap="3" mb="8" p="4" borderWidth="1px" borderRadius="md">
      <Text fontWeight="medium">Import from Discogs (optional)</Text>
      <HStack>
        <Input
          placeholder="Search artist or title…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              runSearch();
            }
          }}
        />
        <Button onClick={runSearch} loading={searchMutation.isPending}>
          Search
        </Button>
      </HStack>

      {searchMutation.data && searchMutation.data.length === 0 ? (
        <Text color="fg.muted" fontSize="sm">
          No releases found.
        </Text>
      ) : null}

      {searchMutation.data && searchMutation.data.length > 0 ? (
        <Stack gap="1" maxH="64" overflowY="auto">
          {searchMutation.data.map((result) => (
            <HStack
              key={result.id}
              gap="3"
              p="2"
              borderRadius="sm"
              cursor="pointer"
              _hover={{ bg: 'bg.muted' }}
              onClick={() => onPick(result)}
            >
              {result.thumb ? (
                <Image src={result.thumb} alt="" boxSize="10" objectFit="cover" borderRadius="sm" />
              ) : null}
              <Stack gap="0">
                <Text fontSize="sm" fontWeight="medium">
                  {result.title}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  {result.artist}
                  {result.year ? ` · ${result.year}` : ''}
                </Text>
              </Stack>
            </HStack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
};

export default DiscogsImport;
