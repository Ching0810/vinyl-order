import { redirect } from 'next/navigation';

/**
 * `/search` — where search lived before it became the home page (tracker.md
 * §12.3): kept for links to it, its words and filters carried over.
 */
export default async function SearchRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const each of Array.isArray(value) ? value : [value]) {
      if (each !== undefined) params.append(key, each);
    }
  }
  const query = params.toString();
  redirect(query ? `/?${query}` : '/');
}
