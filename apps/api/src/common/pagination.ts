import type { Connection, PageArgs } from '@vinyl-order/shared';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/** Cursors are opaque to clients — we just base64url the row id. */
const encodeCursor = (id: string): string => Buffer.from(id).toString('base64url');
const decodeCursor = (cursor?: string): string | undefined =>
  cursor ? Buffer.from(cursor, 'base64url').toString('utf8') : undefined;

const clampSize = (n: number | undefined): number => {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(n)));
};

/**
 * The slice of a findMany call that paging controls. Spread it into the query;
 * the caller keeps `where`, `orderBy` and `include`.
 */
export interface PageWindow {
  take: number;
  cursor?: { id: string };
  skip?: number;
}

/**
 * Cursor-paginate any model with a unique string `id` (Relay connection).
 * Forward with `first`/`after`, backward with `last`/`before`; defaults to the
 * first 10.
 *
 * `fetch` must order the rows deterministically — end the orderBy on `id`,
 * since a timestamp can tie — or pages can skip and repeat rows. One extra row
 * is fetched to learn whether a further page exists in the paging direction.
 *
 * An unknown cursor yields an empty page rather than an error: Prisma finds
 * nothing to anchor on.
 */
export async function paginate<Row extends { id: string }, Node>(
  args: PageArgs,
  fetch: (window: PageWindow) => Promise<Row[]>,
  toNode: (row: Row) => Node,
): Promise<Connection<Node>> {
  const backward = args.last !== undefined || args.before !== undefined;

  if (backward) {
    const size = clampSize(args.last);
    const beforeId = decodeCursor(args.before);
    const rows = await fetch({
      // Negative take walks backward from the cursor (rows before it).
      take: -(size + 1),
      ...(beforeId ? { cursor: { id: beforeId }, skip: 1 } : {}),
    });
    const hasPreviousPage = rows.length > size;
    // The extra row is at the start when walking backward.
    const pageRows = hasPreviousPage ? rows.slice(rows.length - size) : rows;
    return toConnection(pageRows, toNode, {
      hasPreviousPage,
      hasNextPage: Boolean(args.before),
    });
  }

  const size = clampSize(args.first);
  const afterId = decodeCursor(args.after);
  const rows = await fetch({
    take: size + 1,
    // skip:1 jumps past the cursor row itself.
    ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > size;
  const pageRows = hasNextPage ? rows.slice(0, size) : rows;
  return toConnection(pageRows, toNode, {
    hasNextPage,
    hasPreviousPage: Boolean(args.after),
  });
}

function toConnection<Row extends { id: string }, Node>(
  rows: Row[],
  toNode: (row: Row) => Node,
  flags: { hasNextPage: boolean; hasPreviousPage: boolean },
): Connection<Node> {
  const edges = rows.map((row) => ({ node: toNode(row), cursor: encodeCursor(row.id) }));
  return {
    edges,
    pageInfo: {
      ...flags,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
}

/**
 * Query-string page args to PageArgs. Numbers arrive as strings; anything
 * unparseable becomes NaN, which paginate treats as "use the default size".
 */
export const toPageArgs = (query: {
  first?: string;
  after?: string;
  last?: string;
  before?: string;
}): PageArgs => ({
  first: query.first === undefined ? undefined : Number(query.first),
  after: query.after,
  last: query.last === undefined ? undefined : Number(query.last),
  before: query.before,
});
