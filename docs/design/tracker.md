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
  their robots.txt forbids them (§9.3).
- **Other users.** Adding records, the dashboard and the supplier orders are
  admin-only: this is one person's tool. Visitors get a read-only view (§12.1).
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
| `supplier`               | enum `CANDLELIGHT \| THT \| COSMIC \| ROTTEN_BLUES` |                                                      |
| `externalId`             | text                                                | the shop's id; `@@unique([supplier, externalId])`    |
| `url`                    | text                                                |                                                      |
| `sourceTitle`            | text                                                | the shop's own name for it, to check a match against |
| `priceCents`, `currency` | int, text                                           |                                                      |
| `availability`           | enum `IN_STOCK \| PRE_ORDER \| SOLD_OUT`            |                                                      |
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

| `SupplierOrder`  |                                                   |
| ---------------- | ------------------------------------------------- |
| `supplier`       |                                                   |
| `orderNumber`    | the shop's; `@@unique([supplier, orderNumber])`   |
| `orderedAt`      |                                                   |
| `status`         | enum, §9.1                                        |
| `totalCents`     | null — as the shop charged it, including shipping |
| `trackingNumber` | null                                              |
| `note`           | null                                              |

`SupplierOrderItem`: `offerId` (SetNull, with `title` copied in, as
`OrderItem` does), `quantity`, `unitPriceCents`, `expectedAt` (copied from
the offer when added, editable).

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

- **Availability.** `PreOrder` or a pre-order tag or text → `PRE_ORDER`;
  available → `IN_STOCK`; otherwise `SOLD_OUT`.
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
availability = 'IN_STOCK' AND "stockQty" - "reservedQty" >= n` — lines
  sorted by `offerId`. The concurrency argument is unchanged.
- **When `stockQty` is null** (Rotten Blues, THT's pre-orders) there is no
  count to hold against: the guard is `availability = 'IN_STOCK'` alone and
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

`ORDERED` (placed, nothing heard) → `PREPARING` (confirmed; for a pre-order,
waiting for the release) → `SHIPPED` → `DELIVERED`, or `CANCELLED`. Any
forward move is allowed by hand; nothing moves on its own until §9.3.

### 9.2 The page

Grouped by status, open groups first. Each line: cover, title, supplier,
order number (linking to the shop's order page), ordered date, expected date,
status. Sorted by expected date within a group, so the next arrival is on
top. Entry is a form: supplier, order number, date, and items picked from my
offers (or typed, for a record I don't track).

**A line needn't be tracked.** `offerId` is optional from the start, not
only after a delete: a typed line has its own `title`, `supplier` comes from
the order, and its expected date is typed too. A record added to tracking
later can be linked to its line from the product page, and from then on the
line's expected date can follow the offer's. This is what lets the page
come first (§14 step 4), before any adapter exists.

### 9.3 Later: from email

The shops have no customer API, and their order pages need my login. What
every one of them does send is email: an order confirmation and a shipping
notice. Reading those — Gmail API, read-only, only these senders — can create
orders and move them to `SHIPPED` without my typing. That needs OAuth and a
parser per shop's email, so it comes after the page works by hand (step 13).
All four send a confirmation, and as far as known a shipping notice; one
sample of each per shop, forwarded, decides whether parsing them is
practical before that step starts.

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

All admin-only, except the reads a visitor's pages make (§12.1).

| Method and path                                | Purpose                                            |
| ---------------------------------------------- | -------------------------------------------------- |
| `GET /admin/catalog/search?supplier=&q=&used=` | search one supplier's index                        |
| `POST /admin/products/from-catalog`            | create a product and its first offer from an entry |
| `GET /admin/products/:id/candidates`           | candidates at the other suppliers                  |
| `POST /admin/products/:id/offers`              | attach a confirmed candidate (or a pasted URL)     |
| `DELETE /admin/offers/:id`                     | detach a wrong match                               |
| `POST /admin/products/:id/refresh`             | re-fetch the product's offers                      |
| `PATCH /admin/artists/:id`                     | rename; add or remove aliases                      |
| `GET /products/:id`                            | now includes its offers                            |
| `GET /admin/dashboard`                         | the home page's three sections (§12.2)             |
| `GET /products/hot`, `GET /products/slides`    | removed, with the carousel                         |
| `POST /cart/items`                             | takes `offerId`                                    |
| `GET/POST/PATCH /admin/supplier-orders`        | list, record, update status                        |

Shapes go in `packages/shared` as now.

## 12. Web

### 12.1 Who sees what

| Page               | Admin (me)                               | Visitor                             |
| ------------------ | ---------------------------------------- | ----------------------------------- |
| `/`                | the dashboard (§12.2)                    | tracked records, lowest price each  |
| `/products/[id]`   | comparison, candidates, refresh, aliases | comparison, "add to cart" per offer |
| `/admin/search`    | add a record from a supplier's catalog   | —                                   |
| `/supplier-orders` | my orders at the suppliers (§9.2)        | —                                   |
| `/cart`, `/orders` | the demo store, as today                 | the demo store, as today            |

**⚖️ Decision: visitors read, they don't see the personal pages.** The prices
are the shops' public ones, so the comparison is safe to show and is what a
portfolio visitor should see working. The dashboard and supplier orders are
mine — order numbers, what I bought — and stay behind the admin role.

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
3. Data model: §5's changes, `Artist` and `ArtistAlias` included, `pg_trgm`.
4. Supplier orders by hand: the API, the entry form and `/supplier-orders`
   (§9.2), with typed lines. **The first usable page** — for the orders
   already waiting to ship.
5. Checkout on offers (§8): cart and order lines, the reservation guard,
   restock on cancel and expiry.
6. EasyStore and Shopify adapters, with fixtures.
7. Catalog sync for THT and Rotten Blues; used and vinyl flags.
8. API: search, create from catalog, candidates, attach, refresh.
9. Web: search page, product comparison, the visitors' list, the dashboard
   (§12.2), and the product page's "record an order" and link-a-line.
   **The comparison usable.**
10. Cosmic.
11. Candlelight: the WACA adapter (the 1996 page as fixture), paged sync,
    `lastmod` increments.
12. Scheduled refresh and catalog sync in GitHub Actions; alerts from
    snapshots (price drop, back in stock, one or two left).
13. Supplier orders from email.

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
- **An alias table instead of a column per language** — one artist, any
  number of names; the data, not the schema, grows with each new case
  (§5.7).
- **Adapters** — three platforms, four shops, one interface; a fifth shop is
  a class, not a migration (§6.1).
