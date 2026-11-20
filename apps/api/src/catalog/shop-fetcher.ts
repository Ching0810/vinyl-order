/**
 * The one way the API and the sync reach a shop (tracker.md §6.4). Adapters
 * never call `fetch` themselves: every request goes through these checks, so
 * a URL someone pastes can't make the server call anything but a shop's
 * public pages, and the shops are asked politely.
 */

/** Where a shop may be fetched: its exact hosts, and the paths its robots.txt allows. */
export interface ShopRules {
  /** Exact hostnames, e.g. `www.thtrecords.com`. No wildcards. */
  hosts: readonly string[];
  /** Path prefixes, e.g. `/products/`, checked after the URL is parsed. */
  paths: readonly string[];
  /**
   * Exact paths, e.g. `/` for the home page: one page, not every path that
   * starts with it, as a prefix of `/` would be.
   */
  pages?: readonly string[];
}

/**
 * Why a fetch didn't give a page. `refused`: the URL breaks the rules and
 * nothing was sent. `failed`: it was sent, and the shop or the network let
 * it down. The message is a short phrase, fit for `Offer.lastError`.
 */
export class ShopFetchError extends Error {
  constructor(
    readonly kind: 'refused' | 'failed',
    message: string,
    /** Worth one more try: a timeout, a dropped connection, a 5xx. */
    readonly transient = false,
  ) {
    super(message);
    this.name = 'ShopFetchError';
  }
}

export interface ShopFetcherOptions {
  /** The fetch to use; tests pass a fake, so nothing reaches a shop. */
  fetch?: typeof fetch;
  /** Wait between two requests to one host, after the first has finished. */
  pauseMs?: number;
  /**
   * For each request, body included. 30 s: Cosmic's sitemap index takes
   * about 15 s to answer.
   */
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** The wait before the one retry a timeout or a 5xx gets. */
  retryPauseMs?: number;
  /** Clock and timer, replaceable so tests needn't wait. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Names the project to the shops without naming its owner: no repository
 * link, which would carry a personal account name to every shop.
 */
export const USER_AGENT = 'vinyl-order/1.0 (personal price tracker)';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const refused = (message: string) => new ShopFetchError('refused', message);
const failed = (message: string) => new ShopFetchError('failed', message);
const transient = (message: string) => new ShopFetchError('failed', message, true);

/**
 * Fetches a shop's pages within its rules.
 *
 * - **https, the shop's hosts and allowed paths only**, no credentials or
 *   port. The allowlist is exact names of the shops' public sites, so
 *   resolved addresses aren't checked: that guard is for open host lists.
 * - **Redirects are followed by hand**, each one checked like the first URL,
 *   so an allowed host can't send the request anywhere else.
 * - **Each request is capped** in time and size, the body included, and
 *   tried once more after a pause if it timed out or got a 5xx.
 * - **One request at a time per host**, the next starting a pause after the
 *   last one finished. Kept in memory: one fetcher per shop, in one process —
 *   the API or the sync command.
 */
export class ShopFetcher {
  private readonly fetchImpl: typeof fetch;
  private readonly pauseMs: number;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;
  private readonly retryPauseMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  /** Per host: the last request queued, and when the last one finished. */
  private readonly lanes = new Map<string, Promise<unknown>>();
  private readonly lastDone = new Map<string, number>();

  constructor(
    private readonly rules: ShopRules,
    options: ShopFetcherOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? fetch;
    this.pauseMs = options.pauseMs ?? 1_000;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    this.maxRedirects = options.maxRedirects ?? 3;
    this.retryPauseMs = options.retryPauseMs ?? 5_000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * The page's body as text.
   *
   * @throws ShopFetchError - refused before sending, or failed after
   */
  async fetchText(url: string): Promise<string> {
    let current = this.allowed(url);
    for (let redirects = 0; ; redirects += 1) {
      const host = current.hostname;
      const target = current;
      const answer = await this.requestOnceMore(host, target);
      if ('body' in answer) return answer.body;
      if (redirects === this.maxRedirects) throw failed('too many redirects');
      current = this.allowed(new URL(answer.location, current).href);
    }
  }

  /**
   * One request, and one more after a pause if it failed in passing — a
   * timeout, a dropped connection, a 5xx: a shop's server can be slow one
   * minute and quick the next. A 429 is the shop asking to slow down, and a
   * 404 won't change: neither is tried again.
   */
  private async requestOnceMore(host: string, target: URL) {
    try {
      return await this.inLane(host, () => this.request(target));
    } catch (error) {
      if (!(error instanceof ShopFetchError) || !error.transient) throw error;
      await this.sleep(this.retryPauseMs);
      return this.inLane(host, () => this.request(target));
    }
  }

  /** The URL, parsed, if the rules allow it. */
  private allowed(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw refused('not a URL');
    }
    if (url.protocol !== 'https:') throw refused('not https');
    if (url.username || url.password) throw refused('credentials in the URL');
    // Parsing drops the default port, so any port left is another one.
    if (url.port) throw refused('a port other than https');
    if (!this.rules.hosts.includes(url.hostname)) throw refused('not a host of this shop');
    // pathname is read after parsing, so `..` can't climb out of a prefix.
    if (
      !this.rules.paths.some((prefix) => url.pathname.startsWith(prefix)) &&
      !this.rules.pages?.includes(url.pathname)
    ) {
      throw refused('not a path this shop allows');
    }
    return url;
  }

  /** Runs `task` after the host's previous request, a pause after it ended. */
  private inLane<T>(host: string, task: () => Promise<T>): Promise<T> {
    const previous = this.lanes.get(host) ?? Promise.resolve();
    const run = previous.then(async () => {
      const last = this.lastDone.get(host);
      if (last !== undefined) {
        const wait = last + this.pauseMs - this.now();
        if (wait > 0) await this.sleep(wait);
      }
      try {
        return await task();
      } finally {
        this.lastDone.set(host, this.now());
      }
    });
    // The lane waits for the request, whether it succeeded or not.
    this.lanes.set(
      host,
      run.catch(() => undefined),
    );
    return run;
  }

  /** One request: a redirect's target, or the body within the limits. */
  private async request(url: URL): Promise<{ location: string } | { body: string }> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url.href, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html, application/json, application/xml',
        },
        redirect: 'manual',
        signal,
      });
    } catch {
      throw transient(signal.aborted ? 'timed out' : 'unreachable');
    }

    if (REDIRECTS.has(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw failed('a redirect with no target');
      return { location };
    }
    if (!response.ok) {
      await response.body?.cancel();
      const message = `answered ${response.status}`;
      throw response.status >= 500 ? transient(message) : failed(message);
    }

    const declared = Number(response.headers.get('content-length'));
    if (declared > this.maxBytes) {
      await response.body?.cancel();
      throw failed('too large');
    }
    return { body: await this.readCapped(response, signal) };
  }

  /** The body, cut off once it passes maxBytes, whatever was declared. */
  private async readCapped(response: Response, signal: AbortSignal): Promise<string> {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > this.maxBytes) {
          await reader.cancel();
          throw failed('too large');
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof ShopFetchError) throw error;
      throw transient(signal.aborted ? 'timed out' : 'unreachable');
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
}
