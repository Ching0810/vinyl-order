import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DiscogsLookupResult } from '@vinyl-order/shared';

const DISCOGS_API = 'https://api.discogs.com';

/**
 * How long a search response stays cached. Discogs allows ~60 req/min for an
 * authenticated token; server-rendering the catalog on every page view would
 * burn through that quickly, so we memoize per query. In-memory (per instance)
 * for now — move to Redis (already reserved in infra) when running >1 instance.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** The subset of a Discogs search result we read. External data is patchy, so
 *  everything past `id` is optional and mapped defensively below. */
interface DiscogsSearchResult {
  id: number;
  title?: string;
  thumb?: string;
  cover_image?: string;
  year?: string | number;
  format?: string[];
  genre?: string[];
}

interface DiscogsSearchResponse {
  results?: DiscogsSearchResult[];
}

/** The subset of a Discogs release (GET /releases/:id) we read. Richer than a
 *  search result: artists and title are split, images are full-size. */
interface DiscogsRelease {
  id: number;
  title?: string;
  year?: number;
  artists?: { name: string }[];
  images?: { uri?: string; uri150?: string }[];
  formats?: { name: string; descriptions?: string[] }[];
  genres?: string[];
}

/** Inputs to a catalog search (already parsed/defaulted by the controller). */
export interface ProductQuery {
  q?: string;
  genre?: string;
  year?: number;
  page?: number;
  perPage?: number;
}

/**
 * Talks to the Discogs database search API and maps raw results into a
 * `DiscogsLookupResult`. This is an ADMIN import helper — it prefills the
 * product form; the public storefront reads from our own DB, not from here.
 * This is the ONLY place that knows Discogs exists.
 *
 * The token is a server-side secret: this never runs in the browser.
 */
@Injectable()
export class DiscogsService {
  private readonly logger = new Logger(DiscogsService.name);
  private readonly cache = new Map<string, { data: DiscogsLookupResult[]; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {}

  async searchVinyl(query: ProductQuery): Promise<DiscogsLookupResult[]> {
    const url = this.buildSearchUrl(query);
    const key = url.toString();

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const response = await fetch(url, { headers: this.discogsHeaders() });

    if (!response.ok) {
      // 401 bad token, 403 bad/missing UA, 429 rate limited, 5xx upstream, etc.
      // We don't leak the upstream detail to the client — just a 502.
      this.logger.error(`Discogs search failed: ${response.status} ${response.statusText}`);
      throw new BadGatewayException('Failed to fetch products');
    }

    const body = (await response.json()) as DiscogsSearchResponse;
    const results = (body.results ?? []).map((result) => this.toLookupResult(result));

    this.cache.set(key, { data: results, expiresAt: Date.now() + CACHE_TTL_MS });
    return results;
  }

  /**
   * Fetch one release by id, mapped for prefilling the admin product form. The
   * release endpoint is cleaner than search (split artists, full-size images).
   */
  async getRelease(id: number): Promise<DiscogsLookupResult> {
    const response = await fetch(new URL(`/releases/${id}`, DISCOGS_API), {
      headers: this.discogsHeaders(),
    });
    if (!response.ok) {
      this.logger.error(`Discogs release ${id} failed: ${response.status} ${response.statusText}`);
      throw new BadGatewayException('Failed to fetch release');
    }

    const release = (await response.json()) as DiscogsRelease;
    const image = release.images?.[0];
    return {
      id: release.id,
      title: release.title ?? '',
      artist: release.artists?.map((a) => a.name).join(', ') || 'Various',
      year: release.year && release.year > 0 ? release.year : null,
      coverImage: this.imageOrNull(image?.uri),
      thumb: this.imageOrNull(image?.uri150),
      format: (release.formats ?? []).flatMap((f) => [f.name, ...(f.descriptions ?? [])]),
      genres: release.genres ?? [],
    };
  }

  /** Auth + required User-Agent headers for every Discogs request. */
  private discogsHeaders(): Record<string, string> {
    return {
      // Discogs accepts the token via this header form.
      Authorization: `Discogs token=${this.config.get<string>('DISCOGS_TOKEN')}`,
      // A descriptive User-Agent is REQUIRED — Discogs replies 403 without one.
      'User-Agent': this.config.get<string>('DISCOGS_USER_AGENT') ?? 'VinylOrder/0.1',
    };
  }

  private buildSearchUrl(query: ProductQuery): URL {
    const url = new URL('/database/search', DISCOGS_API);
    url.searchParams.set('type', 'release');
    url.searchParams.set('format', 'Vinyl');
    // Newest first. Discogs defaults to relevance; the valid sort fields are
    // released/title/format/label/catno, so "released" desc surfaces the most
    // recent vinyl. (Discogs' date sorting isn't perfect — catalog dates are
    // user-entered — but it's the documented lever for "latest".)
    url.searchParams.set('sort', 'released');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('per_page', String(query.perPage ?? 24));
    url.searchParams.set('page', String(query.page ?? 1));
    if (query.q) url.searchParams.set('q', query.q);
    if (query.genre) url.searchParams.set('genre', query.genre);
    // Optional year filter (e.g. the current year) to narrow "latest" further.
    if (query.year) url.searchParams.set('year', String(query.year));
    return url;
  }

  /**
   * Map a raw Discogs result into a DiscogsLookupResult. Discogs combines the
   * artist and title into one field as "Artist - Title", so we split on the
   * first " - ". Missing year/images normalize to null (matches the schema).
   */
  private toLookupResult(result: DiscogsSearchResult): DiscogsLookupResult {
    const combined = result.title ?? '';
    const sep = combined.indexOf(' - ');
    const artist = sep === -1 ? 'Various' : combined.slice(0, sep).trim();
    const title = sep === -1 ? combined.trim() : combined.slice(sep + 3).trim();

    const yearNum = Number(result.year);
    const year = Number.isInteger(yearNum) && yearNum > 0 ? yearNum : null;

    return {
      id: result.id,
      artist,
      title,
      year,
      coverImage: this.imageOrNull(result.cover_image),
      thumb: this.imageOrNull(result.thumb),
      format: result.format ?? [],
      genres: result.genre ?? [],
    };
  }

  /**
   * Normalize a Discogs image URL. When a release has no image, Discogs returns
   * a placeholder `spacer.gif` (served from st.discogs.com) rather than an empty
   * field — we treat that as "no cover" so the UI shows its own fallback.
   */
  private imageOrNull(url?: string): string | null {
    if (!url || url.includes('spacer.gif')) return null;
    return url;
  }
}
