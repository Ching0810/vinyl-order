# Supplier Price Tracker

- **Status:** Proposed — decisions marked ⚖️ are open
- **Date:** 2026-10-30
- **Scope:** comparing what four Taiwanese record shops charge for the same
  record, and tracking the orders placed with them; the Discogs import goes
- **Changes:** [checkout-orders.md](./checkout-orders.md) (the cart and the
  stock guard move from `Product` to a supplier's offer)

## 1. Why this feature

Until now every price and stock count in the catalog was invented, typed in
to have something for checkout to sell. The store was practice; nobody buys
from it.

This feature is for buying records for real. The records I want are sold by
four shops, each with its own price, stock and pre-order date, and I order
from whichever suits each record. Today that means:

- **Comparing by hand.** Opening four sites to learn who is cheapest, who
  still has copies, and whose pre-order arrives first.
- **Tracking by hand.** Orders spread over four accounts, each checked
  separately to learn what has shipped and what is still being prepared.

The site becomes the one place for both. The storefront and the checkout
stay, as a demo of the order flow, but sell from the suppliers' real data.

| Concept                                     | Where it appears                                         |
| ------------------------------------------- | -------------------------------------------------------- |
| Adapter pattern behind one interface        | one adapter per shop platform, three for four shops (§6) |
| Data integration from sources you don't own | parsing what each shop publishes; failing loudly (§6.3)  |
| Search index separate from the source       | a local catalog, searched with trigrams (§7)             |
| Entity resolution                           | is this listing the same record as that one? (§7.3)      |
| Alias (synonym) table                       | one artist under every name the shops use (§5.7)         |
| Reservation model                           | our holds kept apart from the supplier's count (§8)      |
| Snapshots and change detection              | price and stock history, the basis for alerts (§5.3)     |
| SSRF                                        | the server fetches URLs, so only four hosts (§6.4)       |
| Politeness to other people's servers        | robots.txt, rate limits, no live search (§6.4, §7.1)     |

## 2. Where we are today

- **`Product`** carries `priceCents` and `stock`, made up when the record was
  added, and `discogsReleaseId` from the import.
- **The Discogs import** (`DiscogsService`, `AdminDiscogsController`,
  `packages/shared/src/discogs.ts`, the admin form's import panel) fills a new
  product's title, artist, year, genres, format and cover. It needs
  `DISCOGS_TOKEN`, which every environment and two e2e tests set.
- **Checkout** takes stock with a conditional `UPDATE` on `Product.stock`, in
  `productId` order, and cancelling or expiry returns it exactly once
  (checkout-orders.md §7, payments.md §8.2). A cart line is a product and a
  quantity.

## 3. Goals and non-goals

**Goals**

- Search a supplier's catalog by keyword and add a record from it.
- Find the same record at the other suppliers, and attach each with my
  confirmation.
- A product page that shows, per supplier: price, availability, stock,
  pre-order, expected date, and when it was last checked.
- A page of every order I placed with a supplier and where each stands.
- The demo checkout keeps working, priced and stocked from a supplier's offer.

**Non-goals**

- **Placing orders at the suppliers.** The site compares and records; buying
  stays on their sites.
- **Logging in to the suppliers.** Their order pages need my credentials and
  their robots.txt forbids them (§9.4).
- **Other users managing the catalog.** Adding records and the dashboard are
  admin-only. Supplier orders are the exception: anyone who signs up keeps
  their own, seen by no one else (§12.1). Visitors get a read-only view.
- **Automatic matching.** Editions differ — a European pressing, a Japanese
  one, a coloured variant, a used copy — and a wrong match is worse than
  none (§7.3).
- **Records that aren't vinyl.** Rotten Blues sells more CDs than records.

## 4. The suppliers

Checked on 2026-10-30. Three platforms cover the four shops:

| Supplier                                 | Platform  | Catalog source (§7.1)                                                                       | Live search allowed |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------- | ------------------- |
| THT (thtrecords.com)                     | EasyStore | `sitemap_products_N.xml`, names in `<image:title>`, 300 per file                            | no (`/search`)      |
| Cosmic (cosmicmusicrecord.com)           | EasyStore | the same                                                                                    | no (`/search`)      |
| Rotten Blues (rottenblues.com)           | Shopify   | `/products.json`, 250 per page                                                              | yes                 |
| 燭光 Candlelight (candlelightrecords.tw) | WACA      | `/product/all?page=N`, 20 per page, ~890 pages; sitemap has URLs and `lastmod` but no names | no (`/search/*`)    |

What a product page gives, field by field:

| Field         | Candlelight (WACA)                                       | THT / Cosmic (EasyStore)                                              | Rotten Blues (Shopify) |
| ------------- | -------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------- |
| Price         | JSON-LD `offers.price`                                   | `price` (also in cents)                                               | variant `price`        |
| Availability  | JSON-LD `offers.availability` (`PreOrder`, `InStock`, …) | `available`                                                           | variant `available`    |
| Stock count   | embedded `stock` (0 for a pre-order)                     | `inventory_quantity` — `null` when untracked, as THT's pre-orders are | none                   |
| Pre-order     | `availability = PreOrder`                                | only in text: "預購中", "發行預訂"                                    | tag `預購Pre-order`    |
| Expected date | JSON-LD `availabilityStarts`                             | only in text: "(2027/1/29發行預訂)"                                   | none                   |
| Barcode       | embedded `gtin` (often null)                             | `barcode` (Cosmic fills it: UPC 852428007792)                         | none                   |
| Shop's own id | JSON-LD `productID` (`NU0006794`)                        | product id in the URL / page                                          | product id, handle     |
| Used?         | name contains "二手"                                     | name                                                                  | name / tags            |
| Vinyl?        | category / name ("黑膠")                                 | name ("Vinyl", "LP")                                                  | `product_type = 黑膠`  |

The worked example is Candlelight's
[坂本龍一 Ryuichi Sakamoto – 1996](https://www.candlelightrecords.tw/product/detail/2696454):
1550 TWD, `PreOrder`, `availabilityStarts` 2026-12-31, stock 0, `productID`
NU0006794, `gtin` null.

## 5. Data model

```
Artist             one artist or band, under any of its names
  └─ ArtistAlias   each name it is written as
Product            one record: what is the same at every shop → Artist
  └─ Offer         one shop's listing of it: what differs
       └─ OfferSnapshot   each time it was read
CatalogEntry       a shop's catalog, for search; not my records
SupplierOrder      an order I placed at a shop
  └─ SupplierOrderItem → Offer
```

### 5.1 `Product`: only what the shops share

| Column                            | Change    | Note                                                        |
| --------------------------------- | --------- | ----------------------------------------------------------- |
| `title`, `imageUrl`               | kept      | prefilled from the first shop, editable                     |
| `artist` → `artistId`             | changed   | an `Artist` row with all its names (§5.7)                   |
| `releaseDate`                     | new, null | replaces `year`; often unknown (§6.2)                       |
| `format`                          | kept      | e.g. `2LP`                                                  |
| `edition`                         | new, null | "歐美版", "日版", "限量彩膠" — what tells pressings apart   |
| `priceCents`, `currency`, `stock` | dropped   | a price belongs to a shop, not to the record                |
| `discogsReleaseId`, `genres`      | dropped   | Discogs's fields                                            |
| `isHot`, `slideOrder`             | dropped   | the carousel and hot list give way to the dashboard (§12.2) |
| categories                        | kept      | tabs for the visitors' list                                 |

### 5.2 `Offer`: the same columns for every supplier

| Column                   | Type                                                | Note                                                 |
| ------------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| `productId`              | FK, cascade                                         |                                                      |
| `supplier`               | enum `candlelight \| tht \| cosmic \| rotten_blues` |                                                      |
| `externalId`             | text                                                | the shop's id; `@@unique([supplier, externalId])`    |
| `url`                    | text                                                |                                                      |
| `sourceTitle`            | text                                                | the shop's own name for it, to check a match against |
| `priceCents`, `currency` | int, text                                           |                                                      |
| `availability`           | enum `in_stock \| pre_order \| sold_out`            |                                                      |
| `stockQty`               | int, null                                           | the supplier's count; null = the shop doesn't say    |
| `reservedQty`            | int, default 0                                      | the demo checkout's holds (§8)                       |
| `expectedAt`             | date, null                                          | expected release or shipping date                    |
| `lastCheckedAt`          | timestamp                                           | shown on the page: data is only as fresh as this     |

**⚖️ Decision: one table with nullable columns, not a table per supplier or
a JSON blob.** A comparison is "the same question asked of every shop", so the
answers belong in the same columns: one query, one table on the page, one
sort. What a shop doesn't publish is `null` and shows as "—", never a guess.
A fifth shop is a new adapter and an enum value, not a schema. Per-supplier
tables would make every comparison a union; a JSON column would push the
schema into code that can't be indexed or constrained.

**⚖️ Decision: the comparison is computed when read, never stored.** No
`cheapestOfferId` on `Product`: prices change on every refresh, and a stored
answer is one more thing each refresh must remember to update. Reading a
product's handful of offers and comparing them is cheap. If a list ever
needs "where is each of my records cheapest", that is a query (or an index)
then, not a column now.

`CHECK (stockQty IS NULL OR stockQty >= 0)` and `CHECK (reservedQty >= 0)`
back the rules in §8 the way checkout-orders.md's CHECK backs its stock.

### 5.3 `OfferSnapshot`: history

One row per refresh that **changed** something: `offerId`, `priceCents`,
`availability`, `stockQty`, `expectedAt`, `takenAt`. Writing only changes
keeps the table small (most refreshes find nothing new) and makes each row
an event: "dropped to 1300", "back in stock", "date moved to January".
Alerts (step 12) read these; nothing else does yet.

### 5.4 `CatalogEntry`: the search index

`supplier`, `externalId`, `url`, `title`, `imageUrl`, `priceCents` (when the
catalog source has it), `isUsed`, `isVinyl`, `sourceUpdatedAt` (`lastmod`),
`syncedAt`. Unique on `(supplier, externalId)`; a GIN trigram index on
`title`. It is a copy of each shop's catalog, not of my records: thousands
of rows, rewritten by sync (§7.2), never edited by hand.

### 5.5 `SupplierOrder` and `SupplierOrderItem`

Kept apart from `Order`, which is the demo store's own order with a payment
lifecycle. A supplier order is a note of something bought elsewhere:

| `SupplierOrder`  |                                                                  |
| ---------------- | ---------------------------------------------------------------- |
| `userId`         | whose note it is; every query is scoped by it (Cascade)          |
| `supplier`       | never changes once recorded                                      |
| `orderNumber`    | the shop's; `@@unique([userId, supplier, orderNumber])`          |
| `orderedAt`      | `@db.Date`: a day, no time or timezone to invent                 |
| `status`         | enum, §9.1                                                       |
| `totalCents`     | null — typed as the shop charged it, shipping and discounts in   |
| `currency`       | default `TWD`, as on `Offer` and `Order`                         |
| `paidAt`         | null — `@db.Date`, the day it was paid; null is unpaid (§9.1)    |
| `trackingNumber` | null                                                             |
| `note`           | null                                                             |
| `updatedAt`      | moves on every change, lines included: the edit's version (§9.3) |

The unique key is per user: two people's numbers at one shop never collide
in meaning, and a global key would tell one user another's number exists.
For the same reason another user's order is a 404, never a 403. The total is
typed, not summed from the lines, because shipping and point discounts
aren't lines (燭光: 1550 + 60 − 19).

`SupplierOrderItem`: `offerId` (SetNull, with `title` copied in, as
`OrderItem` does; null for every line until §14 step 9), `quantity`,
`unitPriceCents`, `expectedMonth`, and `imageUrl` (null; the cover a shop's
confirmation email shows, §9.4, or one pasted into the form from the shop's
product page, until the line is linked to an offer with its own). The expected date is a **month**,
`CHAR(7)` `YYYY-MM` with a CHECK on its format: a month is all the shops
promise ("預計2026/11出貨", "12月補貨預訂"), and a stored day would be
invented.

**⚖️ Decision: the expected month belongs to the line; the order's is
derived.** The shops promise per record, in each line's title, and one
order can hold a record in stock beside a pre-order. Storing one month per
order would make import choose which promise to keep and lose the rest; the
order's month can always be worked out from its lines, not the other way
round. That month is the **latest** of its lines: an order ships as one
parcel — one status, one tracking number — so it waits for its last record,
and the soonest would promise it early. The list sorts by it, while each
card shows every record's own month beside its price, so the one holding
the order up is seen. A shop that ships what it has first would need a
status per line, left for later.

### 5.6 Cart and order

- **`CartItem`** points at an `offerId` instead of a `productId`: buying "this
  record from Rotten Blues" is a different line from "this record from THT".
  Unique on `(cartId, offerId)`.
- **`OrderItem`** keeps its `productId` and copies, and adds `offerId`
  (SetNull) and `supplier`, so a past order still says where it was "bought".

### 5.7 `Artist` and `ArtistAlias`: one artist, many names

The shops write the same artist differently, and often more than one way at
once:

| Artist           | As the shops write it                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| 坂本龍一         | 坂本龍一, Ryuichi Sakamoto                                                       |
| ゲシュタルト乙女 | ゲシュタルト乙女, 格式塔少女, Gestalt Girl — all three in one Rotten Blues title |
| 米津玄師         | 米津玄師, Kenshi Yonezu                                                          |
| JENNIE           | Jennie, JENNIE, 제니, 珍妮                                                       |
| Radiohead        | Radiohead                                                                        |

```
Artist       id, name            — the name the site shows, e.g. "坂本龍一"
ArtistAlias  artistId, name, normalized
             @@unique([artistId, normalized]); GIN trigram index on normalized
Product      artistId → Artist (Restrict)
```

`normalized` is the alias in search form: Unicode NFKC (full-width to
half-width), lower case, punctuation and spaces removed. The display `name`
is itself one of the aliases.

**⚖️ Decision: a list of aliases, not a column per language.** Columns such
as `artistZh` and `artistEn` fit 坂本龍一 and nothing else: a Japanese
original is neither, 米津玄師 is kanji but not Chinese, JENNIE has four names,
Radiohead has one. Every new case would be a new column or a name in the
wrong one. A list holds any number of names without asking which language
each is — the same synonym table music catalogs keep for an artist's name
variations.

**Why a table of its own, not `aliases` on `Product`:** names belong to the
artist, not to one record. Entered once, they serve every record by that
artist: the second Sakamoto record already knows all the ways shops write
him.

How aliases are gathered:

- **Creating a product** splits the primary entry's artist into names (§6.2)
  and looks each up by `normalized`. An artist owning one of them is reused;
  otherwise a new artist is created with them all. Two different artists
  owning the names is shown to me rather than guessed.
- **Attaching an offer** proposes the names in that shop's title as new
  aliases, which I keep or drop. The more shops a record has been matched at,
  the more names its artist has for the next search.
- **By hand** on the product page: rename, add, remove.

Not handled yet: **collaborations** are one artist named "A & B". If they turn
out common, `Product`–`Artist` becomes many-to-many.

**Album titles have the same problem** — 《城都傳說：寶可夢金／銀音樂專輯》 is
"Johto Legend: Music from Pokemon" elsewhere — but a title belongs to one
record, so it needs no table: every attached offer's `sourceTitle` already is
one more way to write it, and matching uses them all (§7.3).

## 6. Supplier adapters

### 6.1 The interface

```ts
interface SupplierAdapter {
  supplier: Supplier;
  hosts: string[]; // e.g. ['www.thtrecords.com']
  /** Read one product page into an offer. */
  fetchOffer(url: string): Promise<ParsedOffer>;
  /** Walk the shop's public catalog, a page at a time. */
  syncCatalog(since?: Date): AsyncIterable<ParsedCatalogEntry[]>;
}
```

Three implementations: `WacaAdapter`, `EasyStoreAdapter` (configured twice,
for THT and Cosmic), `ShopifyAdapter`. The same shape as `PaymentProvider`
(payments.md §5.1): the rest of the code knows the interface, and a test can
swap in a fake.

`ParsedOffer` is §5.2's columns plus what the product prefill needs (`title`,
`artistNames`, `imageUrl`, `format`, `edition`, `barcode`).

### 6.2 Normalising

Each adapter maps its shop's facts onto the shared columns:

- **Availability.** `PreOrder` or a pre-order tag or text → `pre_order`;
  available → `in_stock`; otherwise `sold_out`.
- **Expected date.** A structured field when there is one (WACA's
  `availabilityStarts`); otherwise a date pattern in the name or description
  (`2027/1/29`, `2026/12`, "12月底"). A month alone becomes the month's last
  day, and the text it came from is kept for the page to show. Nothing found
  → `null`.
- **Artist and title.** Shops write "Artist - Title edition"; split on the
  first spaced hyphen, strip format words ("黑膠", "2LP", "Vinyl") into
  `format`, and version words ("歐美版", "限量彩膠") into `edition`. Rotten
  Blues writes "【黑膠】Artist《Title》" instead; its adapter knows that shape.
  A prefill only: the add form shows it for correction.
- **Artist names.** The artist part is split where the script changes
  between CJK and Latin, and at "/" — "坂本龍一 Ryuichi Sakamoto" gives
  `["坂本龍一", "Ryuichi Sakamoto"]` — into §5.7's aliases. Also a proposal,
  confirmed on the form.
- **Used, vinyl.** Keywords and categories as in §4's table.

### 6.3 When a shop changes its pages

A parser is a guess about someone else's HTML, and it will go wrong
silently: a redesign can turn a price into `null` or a different number.

- Each adapter **validates what it parsed with zod** (as `MockPayProvider`
  validates MockPay's answer): a page with no price, or an availability it
  doesn't know, is a parse failure, not an offer with gaps.
- **A failed refresh keeps the last good values** and records the failure
  (`lastErrorAt`, `lastError` on `Offer`); the page shows "last checked 3
  days ago — couldn't read the page since". Stale and labelled beats fresh
  and wrong.
- Fixtures (§13) pin each parser to a real saved page, so a change of mine
  can't break one unnoticed; only the shop can.

### 6.4 Fetching other people's pages

- **SSRF.** The API fetches URLs I paste. Only `https` and only the hosts of
  the four adapters are allowed; a redirect is followed only to an allowed
  host; timeout 10 s; response capped at 5 MB. Without this, a pasted URL
  could make the API call anything it can reach.
- **Politeness.** Only paths robots.txt allows (product pages, catalogs,
  sitemaps — never search, cart, member or order pages). One request at a
  time per host with a pause between, and a `User-Agent` that names the
  project. Product pages are fetched only for records I track.

## 7. Search and matching

### 7.1 ⚖️ Decision: search a local copy, not the shops

Three of the four shops forbid automated use of their search in robots.txt,
so "type a keyword, ask the shop" works for Rotten Blues alone. Instead each
shop's public catalog (§4) is copied into `CatalogEntry`, and search runs
there.

| Option                               | For                                                 | Against                                                                    |
| ------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------- |
| **Local index** (chosen)             | allowed everywhere; fast; matching is a local query | sync to build and keep fresh; new listings appear only after the next sync |
| Live search per shop                 | always current; nothing to sync                     | forbidden at three shops; four slow calls per keystroke                    |
| Live for Shopify, index for the rest | Rotten Blues is current                             | two search paths to build and explain                                      |

### 7.2 Sync

Per supplier, upsert by `(supplier, externalId)`; entries the catalog no
longer lists are deleted.

- **EasyStore:** the product sitemaps, each entry's `<image:title>` the name.
- **Shopify:** `/products.json`, page by page; `product_type`, tags and
  `available` come with it.
- **WACA:** first the listing pages (names, prices and ids in each card),
  later only entries whose sitemap `lastmod` moved — ~890 pages once, then a
  handful a day.

Sync runs as a GitHub Actions schedule against Neon (§10), not in the API.

### 7.3 Matching

Search is Postgres `pg_trgm` similarity over a normalised title (lower case,
width-folded, punctuation and format words removed), filtered by supplier,
vinyl, and — unless asked — not used. Trigrams suit this data: titles mix
Chinese, Japanese and English, word order varies, and nothing here needs a
search engine at thousands of rows.

Adding a record:

1. Search one supplier — the "primary" — and pick an entry.
2. Its page is fetched (`fetchOffer`); the product is created from it, with
   its offer.
3. The other suppliers' entries are searched with **every name the product
   is known by**: each of its artist's aliases (§5.7) combined with the
   product's title and each attached offer's `sourceTitle`. An entry's score
   is its best similarity over those combinations, so "坂本龍一 1996" at one
   shop and "Ryuichi Sakamoto – 1996" at another both find it. **A barcode
   match**, when both sides have one, ranks first.
4. The top candidates per supplier are listed with their own names and
   covers, and **I confirm each one**. A confirmed candidate's page is
   fetched into an offer, and the artist names in its title are proposed as
   new aliases (§5.7).

**⚖️ Decision: confirm, don't auto-attach.** The cases that matter are the
hard ones: "歐美版" against "日版", a colour variant, a reissue. Similar
names are exactly what makes them dangerous. A barcode would decide it, but
only Cosmic fills it reliably.

## 8. The demo checkout on offers

The storefront and checkout stay as a demo, now selling a supplier's offer at
its real price.

**⚖️ Decision: hold stock in `reservedQty`, apart from `stockQty`.**
`stockQty` is the supplier's number and only a refresh writes it. Checkout,
cancel and expiry touch only `reservedQty`:

```
refresh            → stockQty                (the supplier's)
checkout           → reservedQty + n         (ours)
cancel / expiry    → reservedQty − n, once
available to sell  = max(stockQty − reservedQty, 0)
```

- **Checkout** keeps checkout-orders.md §7's guard, on the offer row:
  `UPDATE "Offer" SET "reservedQty" = "reservedQty" + n WHERE id = ? AND
availability = 'in_stock' AND "stockQty" - "reservedQty" >= n` — lines
  sorted by `offerId`. The concurrency argument is unchanged.
- **When `stockQty` is null** (Rotten Blues, THT's pre-orders) there is no
  count to hold against: the guard is `availability = 'in_stock'` alone and
  `reservedQty` isn't touched. Pre-orders aren't sold by the demo.
- **When a refresh drops `stockQty` below `reservedQty`,** available reads 0;
  the holds stand until their orders are cancelled or expire. They are
  practice orders; there's nothing to take back.
- **The comparison shows `stockQty` unchanged.** What I need there is what
  the shop has, not what the demo has pretended to sell.

Weighed and not chosen: **decrementing `stockQty` directly** — the next
refresh overwrites it, so a cancel would "return" stock that was never taken
from the number now there; **dropping the stock guard** — simpler, but loses
the concurrency exercise the checkout was built around.

## 9. My supplier orders

### 9.1 Statuses

`ordered` (placed, nothing heard) → `preparing` (confirmed; for a pre-order,
waiting for the release) → `shipped` → `ready_for_pickup` (at the
convenience store, waiting for me) → `delivered` (in my hands), or
`cancelled`. Which moves happen on their own, and which wait for me, is
§9.5. `canChangeSupplierOrderStatus` (shared, so the page offers only the
moves the API accepts) allows:

- any forward move, skipping steps — a shop that never confirms goes
  straight from `ordered` to `shipped`, a parcel delivered to the door never
  waits at a store, and a pickup notice can come with no shipping notice
  before it;
- cancelling until the order ships;
- nothing out of `delivered` or `cancelled`, which are final, so the page
  asks before either.

`ready_for_pickup` is its own status, not a note on `shipped`, because it is
the one that asks something of me: go to the store before the parcel is
sent back. The page puts it first (§9.2). A parcel left uncollected and
returned has no status yet; a note covers it until it happens.

A status change is a compare-and-set: the `UPDATE` matches only while the
order still has the status the rule was checked against. Two tabs moving the
same order get one 200 and one 409 `SUPPLIER_ORDER_BAD_TRANSITION` carrying
the status it has now — the checkout's conditional-`UPDATE` idea again.
Sending the status the order already has is not a change, so a repeated
submit succeeds.

**Payment is not a status**: paying and shipping are independent. Most
orders are paid at checkout, but cash on pickup (Rotten Blues' 超商貨到付款)
is paid only at the store, after the parcel has shipped and arrived. So
`paidAt` is its own nullable day, and an order is **unpaid** while it is null
and the order isn't cancelled.

- **Typed orders**: the form's "Paid on" starts at the order's day, the
  common case; cleared, the order is unpaid.
- **Imported orders**: Shopify's confirmation says what was paid
  (`本日總付款金額`): the whole total → paid on the order's day; `$0.00` →
  unpaid. EasyStore's confirmation says nothing about payment, so its
  orders start unpaid until the shop's payment notice is read (§9.5).
- **"Mark as paid"** on a card sets today (Taipei). Marking an unpaid order
  `delivered` sets it paid today as well, and its confirmation says so: at
  a store, collecting and paying cash are one act. A different day is set
  in the edit form.
- **Orders recorded before `paidAt` existed** were all paid, so the
  migration sets each to its order's day.

A payment day isn't checked against the order's day: the order's day of an
imported order is only the email's (§9.4), and a mistyped one is fixed in
the form.

### 9.2 The page

Two filters, held at the top of the screen under the site header while the
list scrolls: by stage — **All statuses**, **To pick up**, **Shipped**,
**Not shipped** (ordered and preparing: both still with the shop),
**Delivered** and **Cancelled**, each with its count — and by **shop**. They
are laid out as the shops' own catalogues lay theirs: on a wide screen,
"Filter:" with each as a text dropdown and how many orders show at the far
end; on a phone, one "Filter" row opening a side drawer, where each filter
is a row leading into its choices, held as a draft until **Apply** (or
cleared by **Remove all**). Both are
in the URL (`?status=shipped&shop=tht`), so a reload or Back keeps them. "Record
an order" is the page's one action: in the heading on a wide screen, in a
bar held at the bottom of the screen on a phone, so the list comes first.
The email import is set up once and then runs by itself, so instead of a
button it is a status line under the page's description — "last run 3 hours ago", amber
once two days pass without a run, "Set up email import" before it is — that
leads to its page. All statuses is grouped by
status, what needs me first: ready for pickup, then the ones moving —
shipped, preparing, ordered — then delivered and cancelled; any other
choice lists its orders without headings, sorted as a group is.

The page is black and white, light grey cards on the page, so the covers
are its only colour; a status is a pill tinted in its own colour. Each card
is titled by the order — its order number, with its shop as a badge at the
right, which together are what makes it one — since the status, payment and
total on it are the order's; the first record's cover stands for it. Every card has the same
lines in the same places, whatever the order holds: a list of uneven cards
reads as clutter. So a card shows that cover and title, the first record's
title (one line, cut short with an ellipsis) and price × quantity with its own
expected month (§5.5; none once delivered or cancelled), "Unpaid", the
status and its menu, the total and the day. Further records fold under "N more records", which opens
them in place. On a phone the cards are tiles two to a row, the cover alone
on top and the menu in the bottom-right corner; on a wider screen, rows.
The tracking number, the note and the next step's hint (§9.5) belong to the
order's own page, still to come. Not paginated: one person's orders are a page's
worth, and paging by date would split the groups. Each card's menu moves
the status (§9.1), marks it paid, opens the edit form (§9.3) or deletes
the order.

Entry is a form at `/supplier-orders/new`: shop, order number, day, total,
tracking, note, and typed lines. Picking lines from my offers, and covers,
come with step 9.

**A line needn't be tracked.** `offerId` is optional from the start, not
only after a delete: a typed line has its own `title`, `supplier` comes from
the order, and its expected date is typed too. A record added to tracking
later can be linked to its line from the product page, and from then on the
line's expected date can follow the offer's. This is what lets the page
come first (§14 step 4), before any adapter exists.

### 9.3 Changing a recorded order

Everything but the shop is edited in the entry form, filled in, at
`/supplier-orders/[id]/edit`: number, day, total, tracking, note and lines.
Status stays in the menu, so its rules live in one place. The first version
let only tracking and note change — a mistake was deleted and typed again —
but real use corrected a day, a month and a price straight in the database
within a week, so editing came before payments.

**Lines are sent as the whole list.** A line with an `id` is that line,
changed; one without is new; the order's lines missing from the list are
removed. An `id` that isn't one of this order's lines is a 400: it is one
another tab removed, or another order's, and recreating or adopting it would
be wrong either way. Ids are kept rather than every line replaced, because
step 9 links a line to an offer, and that link hangs on the line's id.

**⚖️ Decision: optimistic locking on `updatedAt`.** The form sends the
`updatedAt` of the copy it was filled from as `expectedUpdatedAt`; the
`UPDATE`'s `WHERE` carries it, so if anything changed the order since, nothing
is written and the answer is 409 `SUPPLIER_ORDER_STALE`.

- _Last write wins_ was the alternative: simpler, and two tabs on one
  person's order are rare — but it silently drops one of the edits, and this
  is a form of a dozen fields, not one toggle.
- _`updatedAt`, not a `version` integer:_ every write already moves it, so
  no migration. Its cost is that two writes in the same millisecond look
  like one version; a counter would be the fix if that ever mattered.
- _Optional in the request:_ a client that only moves the status has its own
  check (§9.1), and the API shipped before the web, so the old tracking
  dialog kept working in between.

How it holds together:

- **The order row is written first in the transaction**, lines after. Its
  `UPDATE` takes the row lock, so a second edit of the same order waits
  there, then re-checks its `WHERE`, finds the version moved and gets 409.
  Two edits' lines never interleave, without raising the isolation level.
- **Changing only lines still moves the version**: they live in another
  table, so the order row's `updatedAt` is set explicitly whenever lines are
  sent.
- **The version is also checked against the first read**, not only in the
  `WHERE`, so a stale form carrying a refused status move is reported as
  stale — the real reason — rather than as a bad transition.
- **All or nothing**: a refused line rolls back the order's fields too.
- **The page holds the copy it was filled from.** React Query may refetch
  the order in the background; sending that newer version with the older
  fields would defeat the check. On 409 the page warns and offers "Reload",
  which replaces the fields only when asked, so what was typed can be
  copied first.

### 9.4 From the shops' confirmation emails

The shops have no customer API, and their order pages need my login. What
they do send is email. Recording an order should be placing it at the shop
and nothing else: the confirmation email arrives, and the order appears here
— no typing, for the orders that come in once or twice a month.

**What the emails give** (samples from 2026-10/11, all DKIM-signed):

|                          | THT, Cosmic (EasyStore)                                                | Rotten Blues (Shopify)                                 | Candlelight (WACA)         |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------- |
| Sender                   | `notifications+thtrecords@` / `+universalvinylmusic@mail.easystore.co` | `store+100236001461@t.shopifyemail.com`                | no confirmation of its own |
| Subject                  | `您的訂單已確認。`                                                     | `訂單 #3003 已確認`                                    | —                          |
| Order number             | body: `下訂單#1001`                                                    | subject and body                                       | —                          |
| Lines                    | `title × qty`, then the **line total** `TWD 880`                       | `title × qty` (title may wrap), line total `$1,180.00` | —                          |
| Total                    | `總額: TWD 940` (shipping, tax and points in)                          | `總計 $1,240.00 TWD`                                   | —                          |
| Expected                 | in the title: `(12月補貨預訂)`, `(10/23發行預訂）`                     | none                                                   | —                          |
| Cover                    | `cdn.store-assets.com`, a CSS background in the order's table          | `cdn.shopify.com`, `img.order-list__product-image`     | —                          |
| Link to the product page | none                                                                   | none                                                   | —                          |

Candlelight's mail all comes from its payment provider, PayNow: a card
receipt, an e-invoice notice (invoice number, day and total — no order
number, no lines; the lines are behind a link to the invoice page) and a
pickup notice. Without an order number there is nothing to deduplicate on,
and without lines nothing to record, so **Candlelight stays typed by hand**.
Payment, shipping and pickup notices move orders already recorded; they
are §9.5.

**⚖️ Decision: a Google Apps Script in my own account sends the emails.**

- _Gmail API with OAuth:_ `gmail.readonly` is a restricted scope. Letting
  other users connect needs Google's paid security assessment; left in
  testing mode instead, its refresh tokens expire after 7 days, so it would
  stop every week.
- _Forwarding to an inbound-mail service_ (Cloudflare Email Routing,
  Mailgun): needs a domain and its MX records — not on the free plans.
- _Apps Script:_ free, no review, no domain. It runs as me, inside my own
  account, so access to my mail never leaves it; another user installs their
  own copy.

How it runs:

1. Once a day (10:00 Taipei, inside the wake ping's hours), a time-driven
   trigger searches `from:(the three senders) subject:已確認 newer_than:7d`,
   and pings `/health` until the API is awake.
2. Each email whose first `Authentication-Results` — the one Gmail adds —
   says `dkim=pass` for its sender's domain is POSTed — sender, subject,
   `Date`, and the HTML body with every link removed — to
   `POST /supplier-orders/import`, with the user's import token in the
   `Authorization` header.
3. On `201` or `200` its thread is labelled `vinyl-imported`; on `422`
   `vinyl-import-failed`, for typing by hand. Anything else is sent again
   the next day, as long as the email is within the week.

- **A window, not a "done" label.** The plan was to search
  `-label:vinyl-imported`, but the shops reuse one subject, so Gmail
  threads their confirmations together — and labels belong to threads: a
  new confirmation arriving in a labelled thread would never be found.
  Each run sends the whole week instead and the API's idempotency absorbs
  the repeats; labels only tell the user what happened. A week rides out a
  few days of downtime, and confirmations older than that are never sent,
  so setting it up doesn't fill the list with long-delivered orders.

- **The parsers live in the API, not in the script.** The script only finds
  and forwards, so a shop changing its template is a fix with fixtures and
  CI, not a script every user must copy again.
- **The natural key is the idempotency key.** An email sent twice, or a day
  whose labels failed to stick, lands on `@@unique([userId, supplier,
orderNumber])`: the second import answers `200 already_recorded` instead
  of creating a copy. No message-id table is needed.
- **Imported orders start `ordered`**, as typed ones do (§9.1), whatever the
  email says about the shop confirming.
- **A refused email is not guessed at.** No order number, no lines, no
  total, a line total that doesn't divide by its quantity, or a sender
  nobody parses → `422`, and the email waits for a person.

Parsing rules, pinned by fixture tests:

- **HTML is parsed, whatever the MIME part says.** Cosmic's `text/plain`
  part is HTML too.
- **Stop at the total.** Cosmic follows it with "為您推薦產品", a list of
  other records with prices that must not become lines.
- **Amounts are line totals**: `unitPriceCents = lineTotal / quantity`.
  Thousands separators and `.00` are dropped (`$1,180.00` → 118 000 cents).
- **The lines must add up to the email's subtotal** ("金額:", "小計"),
  exactly. Every sample has one line of quantity 1, where a line total and a
  unit price look the same, and no order with more exists to sample. Were
  the amount a unit price, two copies would import at half price — plausible
  and wrong; against the subtotal it doesn't add up, and the email is
  refused. A discount shown inside the list is caught the same way. The
  total isn't used for this: shipping, tax and points make it differ.
- **Expected month from the title**: `12月` and `10/23` give the month; the
  year is the order's if that month is not before the order's month, else
  the next year's (ordered November, "1月" → January next year). The text
  stays in the title as the shop wrote it.
- **The order's day** is the email's `Date`, as a day in Taipei. The emails
  carry no order date of their own, and a confirmation can come a day after
  the order; the day stays editable (§9.3).
- **A cover** is taken from where each platform puts it beside a line, never
  from any image in the email: EasyStore's first `<img>` is the shop's logo,
  and Cosmic's "為您推薦產品" have pictures too. It is kept only from the
  shops' image hosts (below), and paired with lines only when there is one
  per line.

**Covers typed by hand.** Candlelight sends no confirmation, so its orders
are typed — and had no covers. The form takes a cover's address per line,
copied from the shop's product page ("Copy image address").

- **⚖️ Decision: paste an image address,** not upload a file (storage, an
  upload route and size limits, for one or two records a month) nor paste
  the product page for the server to read its cover (a server fetching a
  typed URL needs an SSRF guard; it comes with the product pages of §14 step
  9, and an address pasted now still works then).
- **One allowlist, shared** (`isAllowedCoverUrl` in `@vinyl-order/shared`):
  https, no credentials or port, and a shop's image host under its product
  path — `cdn.store-assets.com/s/` (EasyStore), `cdn.shopify.com/s/files/`
  (Shopify), `img.cloudimg.in/uploads/shops/37376/` (WACA, narrowed to
  Candlelight's own shop, since the host serves every WACA shop). The form,
  the API and email import all check it, and `next.config.ts` allows the
  same. The path is read after the URL is parsed, so `..` can't climb out.
- **Editing keeps a cover the request leaves out**: a client that doesn't
  send it can't wipe an imported one; null clears it.

**The import token.** The script can't hold a login session (it expires),
so each user has one long-lived token that does one thing: import into
their own orders. Created on the supplier orders page, shown once, and
replaceable or revocable there. Only its SHA-256 is stored: it is 32 random
bytes, so unlike a password it needs no slow hash or salt to resist
guessing, and a leaked table holds nothing that works. `lastUsedAt` shows
whether the script is running.

**Security and privacy.** Nothing here can pay for anything: no email
carries a card number, nothing stores one, and the import token can only add
order records. What is at stake is personal data — the emails carry my name,
my pickup store's address and, from Shopify, an order-page link with an
access key (`shcct_…`) that shows the order to anyone holding it — and the
integrity of my list. Each risk, and what answers it:

| Risk                                                                                                                    | Answer                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The `shcct_` link, and tracking links, leave Gmail                                                                      | The script removes every `href` before sending; the parsers need no link                                                                                                                                                                             |
| A leaked token is used to read my orders                                                                                | The endpoint only writes: a duplicate answers `{ result: 'already_recorded' }` with no order in it, so guessing numbers reveals nothing                                                                                                              |
| A forged "confirmation" is imported                                                                                     | Gmail files most spoofs as spam, which search skips; the script also requires `dkim=pass` for the sender's domain. One that got through could only add a fake order to my own list                                                                   |
| The script's reach: reading and labelling mail needs a scope over the whole mailbox (Gmail has none narrower by sender) | The manifest lists only the scopes it uses; no libraries; ~60 lines in the repo, to be read before pasting. Access stays in my account; the site never holds a Gmail grant                                                                           |
| The token leaks                                                                                                         | 256 random bits, stored as SHA-256, shown once, revocable, `lastUsedAt` shown; sent only in a header, never in a URL, which every layer logs                                                                                                         |
| A huge or hostile body (DoS, ReDoS)                                                                                     | The JSON body limit, Nest's default 100 KB, untouched (the largest sample is ~31 KB of HTML), and a 90 000-character cap on the body field; a real HTML parser, not regexes over the whole body; a tighter throttle on the route than the global one |
| Email text leaks through errors or logs                                                                                 | Bodies are never stored or logged; a `422` names the reason ("no total found") and quotes nothing                                                                                                                                                    |
| A title or image carries script                                                                                         | Titles are stored as text and rendered escaped; covers only from the shops' image hosts (isAllowedCoverUrl), typed or imported, loaded by the browser, never fetched by the server (no SSRF)                                                         |
| A cross-site page makes my browser replace the token                                                                    | The session cookie is `httpOnly` and `sameSite: lax`, so a cross-site POST carries no session                                                                                                                                                        |
| The samples leak through the repo, **which is public**                                                                  | Fixtures replace names, addresses, keys and tracking links with fake values, and the diff is reviewed for them before commit; the original `.eml` files never enter the repo                                                                         |

What remains: the HTML passes through Vercel and Render (over HTTPS, without
links) and is held only for the request; and the script, like any Gmail
automation, can read the whole mailbox — the price of the site never having
that access itself.

### 9.5 After the order: automatic where an email says so, a prompt where none does

What I open the page for, once an order is placed, is one question: **can I
go and pick it up?** Each shop tells some of the answer by email, and the
rest only by SMS from the convenience store (全家, 7-11), which the site
can't read. So every step after the order is one of two kinds, per shop:

- **automatic** — an email the import reads (as §9.4) moves the order;
- **by hand** — the card says where to look and what to mark, so a step
  that can't be automatic is never silently missing.

What the emails make possible (samples from 2026-07/11, all DKIM-signed):

|                       | THT                                      | Cosmic                        | Rotten Blues                                 | Candlelight                                     |
| --------------------- | ---------------------------------------- | ----------------------------- | -------------------------------------------- | ----------------------------------------------- |
| Paid                  | `確認收款通知`: order number, 支付日期   | the same template (or `收據`) | the confirmation's `本日總付款金額` (§9.1)   | by hand                                         |
| Shipped               | `更新訂單出貨通知`: number, `( 已出貨 )` | by hand — no sample yet       | `訂單 #… 的貨件配送中`, with tracking number | by hand                                         |
| Ready for pickup      | by hand — 全家 SMS only                  | by hand — 7-11 SMS only       | `訂單 #… 的貨件已送達`: arrived at the store | PayNow's `物流到店取貨通知`, with a pickup date |
| Delivered (collected) | by hand                                  | by hand                       | by hand                                      | by hand                                         |

No shop says when a parcel is collected — collecting it is my own act, so
`delivered` is always by hand. Rotten Blues' "已送達" means arrived at the
store, not collected: it is sent before pickup.

Rules for the notices, when they are read:

- **They only move forward.** A notice older than what I've marked by hand
  is ignored (`canChangeSupplierOrderStatus`, §9.1), and a repeat changes
  nothing — the same idempotency as confirmations.
- **Confirmations go first.** A run sends a week's confirmations before any
  other notice, so a payment notice doesn't reach the API before its order;
  if it still does, the API answers "not yet" and the next day's run sends
  it again, within the week.
- **Candlelight's pickup notice names no order**: it is matched by shop and
  total among my Candlelight orders not yet collected, and applied only
  when exactly one matches; none or several → `422`, for me to mark.
- **The table lives in code** (`SUPPLIER_FLOW`, web), as data rather than
  sentences: per shop, the steps it has a notice for and how each is
  learned. It says "by hand" for every step until the import of that notice
  ships, so the page never promises an update that won't come.
- **It orders the status menu, it doesn't limit it.** The shop's next step
  comes first, in bold; every other move canChangeSupplierOrderStatus allows
  follows, so an order that goes a way its shop doesn't usually — a parcel
  brought to the door, a notice a shop doesn't normally send — can still be
  recorded. Whether a parcel waits at a store depends on how it was sent,
  not on the shop; with every move offered, a field for that isn't needed
  yet.

Each open card shows its next step:

- the next step is automatic → "Updates when THT emails that it has
  shipped";
- it is by hand → where to look: "THT doesn't email when it reaches the
  store. Check FamilyMart's app or SMS, then mark Ready for pickup";
- ready for pickup → "Pick it up, then mark Delivered".

## 10. Freshness on free plans

- **A product page shows each offer's `lastCheckedAt`** and has a refresh
  button that re-fetches its offers.
- **Scheduled refresh** (step 12) runs in GitHub Actions, not in the API:
  Render sleeps (deploy.md §6.3), and a job inside it would also keep Neon
  awake. A run a few times a day over my tracked offers and a nightly catalog
  sync cost Neon minutes, not hours.
- Covers are the shops' image URLs; nothing is uploaded, so deploy.md's step
  11 (object storage) is no longer needed. `next.config.ts` allows the shops'
  image hosts (`img.cloudimg.in`, `cdn.store-assets.com`, `cdn.shopify.com`)
  and drops `i.discogs.com`.

## 11. API

All admin-only, except the reads a visitor's pages make and the supplier
orders, which any signed-in user has for their own (§12.1).

| Method and path                                 | Purpose                                              |
| ----------------------------------------------- | ---------------------------------------------------- |
| `GET /admin/catalog/search?supplier=&q=&used=`  | search one supplier's index                          |
| `POST /admin/products/from-catalog`             | create a product and its first offer from an entry   |
| `GET /admin/products/:id/candidates`            | candidates at the other suppliers                    |
| `POST /admin/products/:id/offers`               | attach a confirmed candidate (or a pasted URL)       |
| `DELETE /admin/offers/:id`                      | detach a wrong match                                 |
| `POST /admin/products/:id/refresh`              | re-fetch the product's offers                        |
| `PATCH /admin/artists/:id`                      | rename; add or remove aliases                        |
| `GET /products/:id`                             | now includes its offers                              |
| `GET /admin/dashboard`                          | the home page's three sections (§12.2)               |
| `GET /products/hot`, `GET /products/slides`     | removed, with the carousel                           |
| `POST /cart/items`                              | takes `offerId`                                      |
| `GET/POST /supplier-orders`                     | my orders; record one (409 if already recorded)      |
| `GET/PATCH/DELETE /supplier-orders/:id`         | read, change (§9.1, §9.3), delete; 404 if not mine   |
| `POST /supplier-orders/import`                  | one confirmation email, with the import token (§9.4) |
| `GET/POST/DELETE /supplier-orders/import-token` | whether I have one; create or replace it; revoke     |

Shapes go in `packages/shared` as now.

## 12. Web

### 12.1 Who sees what

| Page               | Admin (me)                               | Visitor                             |
| ------------------ | ---------------------------------------- | ----------------------------------- |
| `/`                | the dashboard (§12.2)                    | tracked records, lowest price each  |
| `/products/[id]`   | comparison, candidates, refresh, aliases | comparison, "add to cart" per offer |
| `/admin/search`    | add a record from a supplier's catalog   | —                                   |
| `/supplier-orders` | my orders at the suppliers (§9.2)        | their own, once signed in           |
| `/cart`, `/orders` | the demo store, as today                 | the demo store, as today            |

**⚖️ Decision: visitors read, they don't see the personal pages.** The prices
are the shops' public ones, so the comparison is safe to show and is what a
portfolio visitor should see working. The dashboard is mine and stays behind
the admin role.

**Changed 2026-11-07: supplier orders are everyone's own.** Rather than
admin-only, anyone who signs up records their own orders as a personal
purchase log across the shops — the same row-level scoping as the cart and
the demo orders (§5.5). Nobody sees anyone else's.

The navigation names the two kinds of order apart: "訂單" for the demo store's
own, "我的供應商訂單" for mine. They are different models (§5.5) and must not
read as one list.

### 12.2 The dashboard (`/`, admin)

Three sections, in this order:

1. **Recent changes** — price drops, back in stock, one or two left, an
   expected date moved: the latest `OfferSnapshot` rows, newest first.
2. **Arriving soon** — open supplier order lines (not delivered or
   cancelled), by expected date; the first few, linking to §9.2's page.
3. **Tracked records** — each with its lowest price, where, and whether in
   stock or on pre-order; categories as tabs.

**⚖️ Decision: a dashboard, not a supplier's "hot" list.** None of the shops
publishes sales, so "hot" isn't data we have; one shop's list would also
undo the point of comparing four. What I open the site for is what changed
in the records I care about, and what arrives next. A feed of new listings
across all four (newest `CatalogEntry` rows) would serve browsing; it is left
for later.

The carousel, the hot list and the admin hero page go (step 1).

### 12.3 Pages

- **Search (`/admin/search`):** keyword box, supplier picker, "show used"
  toggle, results with cover, name and price; picking one creates the
  product and opens it.
- **Product page:** the shared details on top; below, a table of offers —
  supplier, price, availability, stock, expected date, last checked, a link
  to the shop. Cheapest price and earliest date are marked. Admins also see
  the candidate list, the refresh button, the artist's aliases to edit, a
  "record an order" action per offer (prefilling §9.2's form with that
  supplier and offer), and "ordered at THT · preparing" when a supplier
  order already holds it.
- **Visitors' list and cards** show "from NT$ …", the lowest price among
  offers in stock or on pre-order.
- **Supplier orders (`/supplier-orders`):** §9.2.

## 13. Testing

- **Parsers against fixtures.** A saved page per platform under
  `apps/api/test/fixtures/` — the Candlelight example, a THT pre-order with
  `inventory_quantity: null`, a Cosmic record with a barcode, a Rotten Blues
  vinyl and a CD. Tests read the files; **nothing in CI touches the shops**.
- **SSRF guard:** another host, `http`, a redirect to another host, an oversized
  response — each refused.
- **Matching:** normalisation cases ("歐美版黑膠2LP"), and a barcode beating a
  closer name; a product found at a shop that writes only another alias of
  its artist ("Ryuichi Sakamoto" for "坂本龍一").
- **Artist names:** splitting "坂本龍一 Ryuichi Sakamoto" into two aliases;
  a new product reusing the artist that owns one of its names; full- and
  half-width forms normalising to the same alias.
- **Checkout on offers:** the existing concurrency tests re-pointed at
  offers, plus: a null `stockQty` sells on availability alone; a refresh
  lowering `stockQty` below `reservedQty` blocks new sales and doesn't break
  a later cancel.
- **Adapters' network side** is checked by hand against the live shops before
  each adapter merges.

## 14. Implementation order

Each step is its own PR.

0. This document.
1. Remove Discogs: API service and controller, shared schema, admin import
   panel, `DISCOGS_TOKEN` (env validation, `.env.example`, Compose, tests,
   Render), `i.discogs.com`. Remove the carousel and hot list with it: their
   endpoints, the home sections, the admin hero page, the product form's
   merchandising fields.
2. Clear the catalog: products, categories' links, carts, and the demo
   orders and payments that point at them — locally, then on Neon once the
   exact statements are confirmed.
3. Data model, additive only: §5's new tables (`CatalogEntry` aside),
   `Artist` and `ArtistAlias` with `pg_trgm`, and the new nullable columns on
   `Product`, `CartItem` and `OrderItem`. Nothing is dropped, so the store
   keeps working and the step deploys on its own; each old column goes in
   the step that stops using it (expand, then contract).
4. Supplier orders by hand: the API, the entry form and `/supplier-orders`
   (§9.2), with typed lines. **The first usable page** — for the orders
   already waiting to ship. _(Done: per-user API #68; list and entry form
   with expected months #69; status, tracking, note and delete #70; editing
   with the version check (§9.3) #71–#72; step 13's email import pulled
   ahead (§9.4). Next: `paidAt` and `ready_for_pickup` by hand, with the
   next-step hints (§9.1, §9.5); then the payment, shipping and pickup
   notices, one shop's notice at a time.)_
5. Checkout on offers (§8): cart and order lines, the reservation guard,
   restock on cancel and expiry. `Product`'s `priceCents`, `currency` and
   `stock` and `CartItem.productId` are dropped here.
6. EasyStore and Shopify adapters, with fixtures.
7. `CatalogEntry` and catalog sync for THT and Rotten Blues; used and vinyl
   flags. The table waits for this step: its columns are settled by the
   shops' catalogs as the sync reads them (§15).
8. API: search, create from catalog, candidates, attach, refresh. Products
   get their `Artist` here, so `Product.artist` (the string) and `year` are
   dropped, and `artistId` becomes required.
9. Web: search page, product comparison, the visitors' list, the dashboard
   (§12.2), and the product page's "record an order" and link-a-line.
   **The comparison usable.**
10. Cosmic.
11. Candlelight: the WACA adapter (the 1996 page as fixture), paged sync,
    `lastmod` increments.
12. Scheduled refresh and catalog sync in GitHub Actions; alerts from
    snapshots (price drop, back in stock, one or two left).
13. Supplier orders from email — **pulled ahead to follow step 4**, once
    typing orders in had shown what it costs: confirmations from THT, Cosmic
    and Rotten Blues (§9.4). _(Done: API #74 — parsers, import token,
    import route; web and the Apps Script (`tools/gmail-import/`) #75.)_
    Payment, shipping and pickup notices follow (§9.5).

Removal first so the model change starts from a schema with nothing of
Discogs left in it. **Supplier orders come straight after the model**,
ahead of the comparison they are listed after in this document: orders
placed before this site existed are already waiting to ship, and a typed
line (§9.2) needs no adapter, catalog or offer. Checkout moves to offers before any adapter exists, so
that step can be tested with offers made in the test itself, apart from
parsing.

## 15. Open questions

1. ~~How is an artist stored when shops write the name differently ("坂本龍一"
   vs "Ryuichi Sakamoto")?~~ An `Artist` with a display name and any number
   of aliases, not a column per language (§5.7).
2. ⚖️ Where do alerts go — email, LINE Notify's successor, a page of
   changes? Decide with step 12.
3. ⚖️ Does THT's catalog include non-vinyl items, and how are they named?
   Settled while writing step 7's filter.
4. Is a WACA listing card enough for the index, or does it miss names that
   only the product page has? Measured in step 11.
5. Does Neon's free 0.5 GB fit the index? Estimated at a few MB for ~20k
   entries; checked after the first full sync.
6. Does `pg_trgm` work on Chinese and Japanese? It builds trigrams only from
   characters the database's locale counts as letters, so CJK may be
   skipped — and the local Docker and Neon locales may differ. Short names
   (`珍妮`) give too few trigrams for a stable similarity either way. Step 8
   matches on `normalized` exactly first and falls back to trigrams, with
   CJK cases (`坂本龍一`, `米津玄師`) in the e2e suite, run in CI and checked
   on Neon. If trigrams prove useless for CJK: bigrams, or a stored
   romanisation.

## 16. Interview talking points

- **Why a local index instead of calling the shops' search** — robots.txt,
  latency, and matching becoming a query (§7.1).
- **Entity resolution with a human in the loop** — when a wrong match costs
  more than a missing one, rank candidates and let a person decide (§7.3).
- **Separating someone else's number from yours** — `stockQty` vs
  `reservedQty`, the same idea as a booking hold (§8).
- **Integrating with sources you don't control** — validate, keep the last
  good value, label staleness, never fill a gap with a guess (§6.3).
- **SSRF** — the moment a server fetches a user's URL (§6.4).
- **Ingesting from a channel you don't control** — a dumb forwarder, parsers
  on the server under test, the natural key as the idempotency key, and a
  `422` that waits for a person instead of a guess (§9.4).
- **Automate what the channel says, prompt for what it doesn't** — a
  per-shop table of which steps an email moves, which the page reads, so a
  step that can't be automatic is shown as the user's to do rather than
  silently missing (§9.5).
- **API tokens** — long-lived, single-purpose, shown once, stored as a
  SHA-256 because they are random, unlike passwords (§9.4).
- **Optimistic locking** — a version in the `WHERE`, a 409 when it moved,
  and locking the parent row first so a whole-list replace of its children
  can't interleave (§9.3).
- **An alias table instead of a column per language** — one artist, any
  number of names; the data, not the schema, grows with each new case
  (§5.7).
- **Adapters** — three platforms, four shops, one interface; a fifth shop is
  a class, not a migration (§6.1).
