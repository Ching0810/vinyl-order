// Cursor-based pagination contract shared by apps/web and apps/api, modeled on
// the Relay connection spec (the pattern Shopify's GraphQL API uses).
//
// Cursors are opaque strings: the client never parses them, it just echoes a
// previous `endCursor` back as `after` (forward) or `startCursor` as `before`
// (backward). This stays correct under inserts/deletes and is fast at any depth,
// unlike offset paging — the trade-off is no arbitrary "jump to page N".

/** Forward (`first`/`after`) or backward (`last`/`before`) page request. */
export interface PageArgs {
  /** Take the first N after `after` (forward paging). */
  first?: number;
  /** Opaque cursor: return items after this one. */
  after?: string;
  /** Take the last N before `before` (backward paging). */
  last?: number;
  /** Opaque cursor: return items before this one. */
  before?: string;
}

/** Whether there are more pages, and the cursors at each end of this page. */
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

/** One item plus its cursor (used to page from this position). */
export interface Edge<T> {
  node: T;
  cursor: string;
}

/** A page of results: the edges plus paging metadata. */
export interface Connection<T> {
  edges: Edge<T>[];
  pageInfo: PageInfo;
}
