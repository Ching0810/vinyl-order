'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import CatalogSearch from '@/components/catalog-search';
import PageShell from '@/components/layout/page-shell';
import { toCatalogSearchState } from '@/lib/utils/catalog-search';

/** Reads the search from the URL, then hands it down. */
const SearchFromUrl = () => {
  const params = useSearchParams();
  return <CatalogSearch search={toCatalogSearchState(new URLSearchParams(params.toString()))} />;
};

/**
 * `/` — the shops searched by album (tracker.md §12.3): what's popular at the
 * shops until something is searched. `useSearchParams` needs a Suspense
 * boundary above it, so it lives here.
 */
export default function HomePage() {
  return (
    <PageShell>
      <Suspense fallback={null}>
        <SearchFromUrl />
      </Suspense>
    </PageShell>
  );
}
