'use client';

import { Button, Spinner, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import EmptyState from '@/components/ui/empty-state';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  type CatalogSearchState,
  MIN_SEARCH_LENGTH,
  catalogSearchHref,
} from '@/lib/utils/catalog-search';
import { useMe } from '@/services/queries/auth/useMe';
import { useCatalogSearch } from '@/services/queries/catalog/useCatalogSearch';

import Albums from './albums';
import SearchControls from './controls';
import Popular from './popular';

/**
 * The search box, its filters, and under them what's popular at the shops —
 * or, once something is searched, the albums found. The URL holds the
 * search, so going back from a record keeps it: the words reach it 400ms
 * after the last keystroke, a filter at once.
 *
 * Anyone sees what's popular; searching is for members, so someone not
 * signed in who searches is asked to sign in.
 *
 * @param search - the search the URL describes
 */
export default function AlbumSearch({ search }: { search: CatalogSearchState }) {
  const router = useRouter();
  const { data: user, isPending: userPending } = useMe();
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
    enabled: searchable && !!user,
  });

  /** A popular listing picked: its words in the box, the box in view. */
  const pick = (picked: string) => {
    setWords(picked);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderBody = () => {
    if (!searchable) return <Popular onPick={pick} />;
    if (userPending) return <Spinner color="fg.muted" />;
    if (!user) {
      return (
        <EmptyState
          title="Sign in to search the shops"
          body="Search every shop by album, and track the versions you want to compare."
          cta={
            <Button asChild colorPalette="brand" borderRadius="full">
              <NextLink href="/login">Sign in</NextLink>
            </Button>
          }
        />
      );
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
