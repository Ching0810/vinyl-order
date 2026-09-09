'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { useServerInsertedHTML } from 'next/navigation';
import { type ReactNode, useState } from 'react';

/**
 * Emotion SSR registry for the App Router.
 *
 * A default Emotion cache renders its rules as inline `<style>` tags during the
 * server render, but renders nothing in the equivalent client position (styles
 * go in through `useInsertionEffect` instead). React then hydrates against
 * server HTML holding extra `<style>` elements and reports a mismatch.
 *
 * `cache.compat = true` suppresses those inline tags, stashing rules on
 * `cache.inserted` instead; `useServerInsertedHTML` flushes them into `<head>`.
 * `<head>` is also where the cascade needs them, so Chakra's `@layer` order
 * declaration lands ahead of every rule depending on it.
 */
const EmotionRegistry = ({ children }: { children: ReactNode }) => {
  const [{ cache, flush }] = useState(() => {
    // Key 'css' matches Emotion's default, so class names are unchanged.
    const cache = createCache({ key: 'css' });
    cache.compat = true;

    // Wrap insert() to record, in insertion order, every rule added since the
    // last flush. Order is preserved because the cascade depends on it.
    let inserted: string[] = [];
    const prevInsert = cache.insert;
    cache.insert = (...args: Parameters<typeof prevInsert>) => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return prevInsert(...args);
    };

    const flush = () => {
      const names = inserted;
      inserted = [];
      return names;
    };

    return { cache, flush };
  });

  // Runs once per streamed chunk, so emit only what was added since last time.
  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) return null;

    let styles = '';
    for (const name of names) {
      // In compat mode the server stores rule text here; `true` is the
      // client-side marker and carries no CSS.
      const rules = cache.inserted[name];
      if (typeof rules === 'string') styles += rules;
    }

    return (
      <style
        data-emotion={`${cache.key} ${names.join(' ')}`}
        // Not user input: `styles` is CSS text Emotion generated from our own
        // style objects during this render. A <style> element's content cannot
        // be expressed any other way in JSX.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
};

export default EmotionRegistry;
