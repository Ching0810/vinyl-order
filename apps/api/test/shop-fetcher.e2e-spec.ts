import {
  ShopFetcher,
  ShopFetchError,
  type ShopFetcherOptions,
  USER_AGENT,
} from '../src/catalog/shop-fetcher';

/**
 * The guard every request to a shop goes through (docs/design/tracker.md
 * §6.4): what is refused before sending, what fails after, and the pause
 * between requests to one host.
 *
 * A fake fetch stands in for the network, so nothing here reaches a shop.
 * Pure, no app: kept as an e2e spec only because CI runs those.
 */

const RULES = {
  hosts: ['shop.example', 'www.shop.example'],
  paths: ['/products/', '/sitemap'],
};

const PAGE = 'https://shop.example/products/1';

type Answer = Response | ((init: RequestInit) => Promise<Response>);

/**
 * A fetch that answers from a script, and remembers what it was asked. A
 * Response is handed out as it is, so each is answered once; a function
 * answers every time. (A clone would tee the body, and cancelling one side
 * of a tee waits for the other.)
 */
const fakeFetch = (answers: Record<string, Answer>) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (input: string, init: RequestInit) => {
    calls.push({ url: input, init });
    const answer = answers[input];
    if (!answer) return Promise.reject(new TypeError('fetch failed'));
    return typeof answer === 'function' ? answer(init) : Promise.resolve(answer);
  };
  return { impl, calls };
};

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

const fetcherWith = (answers: Record<string, Answer>, options: ShopFetcherOptions = {}) => {
  const fake = fakeFetch(answers);
  const fetcher = new ShopFetcher(RULES, {
    fetch: fake.impl,
    sleep: () => Promise.resolve(),
    ...options,
  });
  return { fetcher, calls: fake.calls };
};

const errorOf = async (promise: Promise<unknown>): Promise<ShopFetchError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ShopFetchError) return error;
    throw error;
  }
  throw new Error('Expected a ShopFetchError, got a page');
};

describe('Shop fetcher (e2e)', () => {
  it('fetches an allowed page, saying who it is', async () => {
    const { fetcher, calls } = fetcherWith({ [PAGE]: new Response('<html>ok</html>') });

    await expect(fetcher.fetchText(PAGE)).resolves.toBe('<html>ok</html>');

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe(USER_AGENT);
    expect(USER_AGENT).not.toMatch(/github|http/i);
    expect(calls[0].init.redirect).toBe('manual');
  });

  describe('refused before anything is sent', () => {
    it.each([
      ['not a URL', 'shop.example/products/1', 'not a URL'],
      ['http', 'http://shop.example/products/1', 'not https'],
      ['another host', 'https://evil.example/products/1', 'not a host of this shop'],
      [
        'a host that only ends like the shop',
        'https://evilshop.example/products/1',
        'not a host of this shop',
      ],
      ['an address', 'https://127.0.0.1/products/1', 'not a host of this shop'],
      ['credentials', 'https://user:pass@shop.example/products/1', 'credentials in the URL'],
      ['another port', 'https://shop.example:8443/products/1', 'a port other than https'],
      [
        'a path robots.txt forbids',
        'https://shop.example/search?q=x',
        'not a path this shop allows',
      ],
      [
        'a path climbing out of an allowed one',
        'https://shop.example/products/../cart',
        'not a path this shop allows',
      ],
      [
        'the same, encoded',
        'https://shop.example/products/%2e%2e/cart',
        'not a path this shop allows',
      ],
    ])('%s', async (_case, url, message) => {
      const { fetcher, calls } = fetcherWith({});

      const error = await errorOf(fetcher.fetchText(url));

      expect(error).toMatchObject({ kind: 'refused', message });
      expect(calls).toHaveLength(0);
    });

    it('allows the default port written out', async () => {
      const { fetcher } = fetcherWith({ [PAGE]: new Response('ok') });

      await expect(fetcher.fetchText('https://shop.example:443/products/1')).resolves.toBe('ok');
    });
  });

  describe('redirects', () => {
    it('follows one to an allowed host and path, relative or absolute', async () => {
      const { fetcher, calls } = fetcherWith({
        [PAGE]: redirect('https://www.shop.example/products/1', 301),
        'https://www.shop.example/products/1': redirect('/products/2'),
        'https://www.shop.example/products/2': new Response('moved'),
      });

      await expect(fetcher.fetchText(PAGE)).resolves.toBe('moved');
      expect(calls.map((call) => call.url)).toEqual([
        PAGE,
        'https://www.shop.example/products/1',
        'https://www.shop.example/products/2',
      ]);
    });

    it.each([
      ['another host', 'https://evil.example/products/1', 'not a host of this shop'],
      [
        'an internal address',
        'https://169.254.169.254/latest/meta-data',
        'not a host of this shop',
      ],
      ['http', 'http://shop.example/products/1', 'not https'],
      ['a forbidden path', '/cart', 'not a path this shop allows'],
    ])('refuses one to %s, without following it', async (_case, location, message) => {
      const { fetcher, calls } = fetcherWith({ [PAGE]: redirect(location) });

      const error = await errorOf(fetcher.fetchText(PAGE));

      expect(error).toMatchObject({ kind: 'refused', message });
      expect(calls).toHaveLength(1);
    });

    it('gives up after three', async () => {
      const { fetcher, calls } = fetcherWith({
        [PAGE]: redirect('/products/2'),
        'https://shop.example/products/2': redirect('/products/3'),
        'https://shop.example/products/3': redirect('/products/4'),
        'https://shop.example/products/4': redirect('/products/5'),
      });

      const error = await errorOf(fetcher.fetchText(PAGE));

      expect(error).toMatchObject({ kind: 'failed', message: 'too many redirects' });
      expect(calls).toHaveLength(4);
    });

    it('fails one with no target', async () => {
      const { fetcher } = fetcherWith({ [PAGE]: new Response(null, { status: 302 }) });

      expect(await errorOf(fetcher.fetchText(PAGE))).toMatchObject({
        kind: 'failed',
        message: 'a redirect with no target',
      });
    });
  });

  describe('failed after sending', () => {
    it.each([404, 500, 503])('an answer of %i', async (status) => {
      const { fetcher } = fetcherWith({ [PAGE]: new Response('no', { status }) });

      expect(await errorOf(fetcher.fetchText(PAGE))).toMatchObject({
        kind: 'failed',
        message: `answered ${status}`,
      });
    });

    it('a shop that cannot be reached', async () => {
      const { fetcher } = fetcherWith({});

      expect(await errorOf(fetcher.fetchText(PAGE))).toMatchObject({
        kind: 'failed',
        message: 'unreachable',
      });
    });

    it('a body declared larger than the cap, before reading it', async () => {
      const { fetcher } = fetcherWith(
        { [PAGE]: new Response('small', { headers: { 'content-length': '11' } }) },
        { maxBytes: 10 },
      );

      expect(await errorOf(fetcher.fetchText(PAGE))).toMatchObject({
        kind: 'failed',
        message: 'too large',
      });
    });

    it('a body that grows past the cap while read, whatever it declared', async () => {
      const { fetcher } = fetcherWith({ [PAGE]: new Response('x'.repeat(11)) }, { maxBytes: 10 });

      expect(await errorOf(fetcher.fetchText(PAGE))).toMatchObject({
        kind: 'failed',
        message: 'too large',
      });
    });

    it('a body exactly at the cap is read', async () => {
      const { fetcher } = fetcherWith({ [PAGE]: new Response('x'.repeat(10)) }, { maxBytes: 10 });

      await expect(fetcher.fetchText(PAGE)).resolves.toHaveLength(10);
    });

    it('a shop too slow to answer', async () => {
      const hanging = (init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('', 'TimeoutError')),
          );
        });
      const { fetcher } = fetcherWith({ [PAGE]: hanging }, { timeoutMs: 20 });

      expect(await errorOf(fetcher.fetchText(PAGE))).toMatchObject({
        kind: 'failed',
        message: 'timed out',
      });
    });
  });

  describe('one request at a time per host', () => {
    /** A clock that only moves when the fetcher sleeps. */
    const clock = () => {
      let time = 0;
      const sleeps: number[] = [];
      return {
        now: () => time,
        sleep: (ms: number) => {
          sleeps.push(ms);
          time += ms;
          return Promise.resolve();
        },
        sleeps,
      };
    };

    it('waits the pause after the last request to that host finished', async () => {
      const time = clock();
      const { fetcher, calls } = fetcherWith(
        {
          [PAGE]: new Response('1'),
          'https://shop.example/products/2': new Response('2'),
          'https://shop.example/products/3': new Response('3'),
        },
        { pauseMs: 1_000, now: time.now, sleep: time.sleep },
      );

      const pages = await Promise.all([
        fetcher.fetchText(PAGE),
        fetcher.fetchText('https://shop.example/products/2'),
        fetcher.fetchText('https://shop.example/products/3'),
      ]);

      expect(pages).toEqual(['1', '2', '3']);
      expect(calls.map((call) => call.url)).toEqual([
        PAGE,
        'https://shop.example/products/2',
        'https://shop.example/products/3',
      ]);
      expect(time.sleeps).toEqual([1_000, 1_000]);
    });

    it('never runs two requests to one host at once', async () => {
      let inFlight = 0;
      let most = 0;
      const slow = async () => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return new Response('ok');
      };
      const { fetcher } = fetcherWith({ [PAGE]: slow, 'https://shop.example/products/2': slow });

      await Promise.all([
        fetcher.fetchText(PAGE),
        fetcher.fetchText('https://shop.example/products/2'),
      ]);

      expect(most).toBe(1);
    });

    it('does not wait when the pause has already passed', async () => {
      const time = clock();
      const { fetcher } = fetcherWith(
        { [PAGE]: () => Promise.resolve(new Response('1')) },
        { pauseMs: 1_000, now: time.now, sleep: time.sleep },
      );

      await fetcher.fetchText(PAGE);
      await time.sleep(5_000);
      time.sleeps.length = 0;
      await fetcher.fetchText(PAGE);

      expect(time.sleeps).toEqual([]);
    });

    it('keeps going after a request fails', async () => {
      const { fetcher } = fetcherWith({ 'https://shop.example/products/2': new Response('2') });

      const [first, second] = await Promise.allSettled([
        fetcher.fetchText(PAGE),
        fetcher.fetchText('https://shop.example/products/2'),
      ]);

      expect(first.status).toBe('rejected');
      expect(second).toEqual({ status: 'fulfilled', value: '2' });
    });

    it('does not make one host wait for another', async () => {
      const time = clock();
      const { fetcher } = fetcherWith(
        { [PAGE]: new Response('1'), 'https://www.shop.example/products/1': new Response('2') },
        { pauseMs: 1_000, now: time.now, sleep: time.sleep },
      );

      await Promise.all([
        fetcher.fetchText(PAGE),
        fetcher.fetchText('https://www.shop.example/products/1'),
      ]);

      expect(time.sleeps).toEqual([]);
    });
  });
});
