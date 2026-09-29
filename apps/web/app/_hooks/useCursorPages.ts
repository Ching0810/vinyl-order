'use client';

import type { Connection, PageArgs } from '@vinyl-order/shared';
import { useState } from 'react';

/** Where a paginator can send the reader. Cursor paging reaches nothing else. */
export type PageTarget = 'first' | 'previous' | 'next' | 'last';

/** What a page move needs from the page on screen. */
type CurrentPage = Pick<Connection<unknown>, 'pageInfo' | 'totalCount'>;

interface PageState {
  /** The list these args belong to; see resetKey. */
  key: string | undefined;
  args: PageArgs;
  /** 1-based page number, tracked here: a cursor does not know its position. */
  page: number;
}

/**
 * How many pages `totalCount` items fill, `size` at a time. At least 1, so an
 * empty list is still "page 1 of 1".
 */
export const pageCount = (totalCount: number, size: number): number =>
  Math.max(1, Math.ceil(totalCount / size));

/**
 * Paging state for a cursor-paginated list: the args to fetch with, the page
 * number to show, and how to move.
 *
 * Only the first page, the adjacent pages and the last page are reachable, as
 * cursor paging allows. The last page is fetched as `last: <what is left over>`
 * rather than `last: size`, so it holds exactly the items the page numbering
 * says it does, and stepping back from it lands on whole pages again.
 *
 * The page number is kept here, not read from the server — a cursor has no
 * position. If the list changes while someone pages, the number can drift by
 * one; the items shown are still exactly right.
 *
 * @param size - items per page
 * @param resetKey - identifies the list (e.g. the category). When it changes
 *   the reader starts over on page 1, since cursors from the old list point
 *   into a different result set.
 */
export const useCursorPages = (size: number, resetKey?: string) => {
  const [state, setState] = useState<PageState>({
    key: resetKey,
    args: { first: size },
    page: 1,
  });

  // Worked out during render rather than in an effect, so a request for the
  // new list is never made with the old list's cursor.
  const current: PageState =
    state.key === resetKey ? state : { key: resetKey, args: { first: size }, page: 1 };

  const go = (target: PageTarget, { pageInfo, totalCount }: CurrentPage) => {
    const lastPage = pageCount(totalCount, size);
    const moves: Record<PageTarget, Omit<PageState, 'key'>> = {
      first: { args: { first: size }, page: 1 },
      previous: {
        args: { last: size, before: pageInfo.startCursor ?? undefined },
        page: Math.max(1, current.page - 1),
      },
      next: {
        args: { first: size, after: pageInfo.endCursor ?? undefined },
        page: current.page + 1,
      },
      last: {
        args: { last: totalCount - (lastPage - 1) * size || size },
        page: lastPage,
      },
    };
    setState({ key: resetKey, ...moves[target] });
  };

  return { args: current.args, page: current.page, go };
};
