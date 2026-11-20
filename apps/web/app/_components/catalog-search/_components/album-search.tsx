'use client';

import { Spinner, Text } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  type CatalogSearchState,
  MIN_SEARCH_LENGTH,
  catalogSearchHref,
} from '@/lib/utils/catalog-search';
import { useCatalogSearch } from '@/services/queries/catalog/useCatalogSearch';

import Albums from './albums';
import SearchControls from './controls';

/**
 * The search box, its filters and the albums found. The URL holds the search,
 * so going back from a record keeps it: the words reach it 400ms after the
 * last keystroke, a filter at once.
 *
 * @param search - the search the URL describes
 */
export default function AlbumSearch({ search }: { search: CatalogSearchState }) {
  const router = useRouter();
  const [words, setWords] = useState(search.q);
  const settled = useDebouncedValue(words.trim(), 400);

  const go = (next: CatalogSearchState) =>
    router.replace(catalogSearchHref(next), { scroll: false });

  // The words settling moves the URL; a filter moves it itself, and leaves
  // the words as they are, so this then finds nothing to do.
  useEffect(() => {
    if (settled !== search.q) {
      router.replace(catalogSearchHref({ ...search, q: settled }), { scroll: false });
    }
  }, [settled, search, router]);

  const searchable = search.q.length >= MIN_SEARCH_LENGTH;
  const {
    data: albums,
    isPending,
    isError,
    isFetching,
  } = useCatalogSearch(search, {
    enabled: searchable,
  });

  const renderBody = () => {
    if (!searchable) {
      return <Text color="fg.muted">Type an artist or an album, two characters or more.</Text>;
    }
    if (isPending) return <Spinner color="fg.muted" />;
    if (isError) return <Text color="fg.error">The search failed. Try again.</Text>;
    if (albums.length === 0) {
      return <Text color="fg.muted">Nothing at the shops matches that.</Text>;
    }
    return <Albums albums={albums} stale={isFetching} />;
  };

  return (
    <>
      <SearchControls words={words} onWordsChange={setWords} search={search} onChange={go} />
      {renderBody()}
    </>
  );
}
