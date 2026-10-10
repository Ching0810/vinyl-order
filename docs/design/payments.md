# Payments & Order Lifecycle

- **Status:** In progress — steps 1–5 built (§11); decisions still marked ⚖️
  are open
- **Date:** 2026-09-24 · **Updated:** 2026-10-10
- **Scope:** paying for a `pending` order through a simulated payment provider,
  expiring unpaid orders after 15 minutes, letting a customer cancel an unpaid
  order, and letting an admin mark a paid order shipped
- **Follows:** [checkout-orders.md](./checkout-orders.md) (non-goals: payments,
  cancellation that restocks, reservations with expiry) and
  [idempotency.md](./idempotency.md)

## 1. Why this feature

Checkout takes stock the moment an order is placed, and the order then sits in
`pending` forever. That is two problems at once:

- **Nobody pays.** There is no way to get from `pending` to `paid`.
- **Unpaid orders hold stock indefinitely.** Five people who close the tab on
  the payment step can sell out a limited pressing without buying a single copy.

Taking payment means talking to a system we do not control, and that system
reports back **asynchronously**, **at least once**, and **in no guaranteed
order**. Most of this document is about staying correct under those three
properties.

| Concept                                | Where it appears                                           |
| -------------------------------------- | ---------------------------------------------------------- |
| State machines                         | the order lifecycle and which transitions are legal        |
| Conditional updates as transitions     | `WHERE status = 'pending'` picks one winner per order      |
| Webhooks / async integration           | the provider tells us a payment succeeded, later           |
| Idempotent consumers                   | a webhook delivered twice changes the order once           |
| Message authentication (HMAC)          | only the provider can move an order to `paid`              |
| Reservations with expiry               | stock is held for 15 minutes, then released                |
| Background jobs safe on many instances | the expiry sweep can run anywhere, any number of times     |
| Never trust the client for money       | the browser returning from the payment page proves nothing |

## 2. Where we are today

Facts from the current code, which shape the design:

- `OrderStatus` already has `pending | paid | shipped | cancelled`, in both
  Prisma and `packages/shared/src/order.ts`. Only `pending` is ever written.
- **Stock is taken at checkout**, inside the checkout transaction, by a
  conditional decrement (`takeStock`: `WHERE stock >= quantity`). So a
  `pending` order is already a reservation — it just never ends.
- `OrderItem.productId` is **nullable** (`SetNull` when a product is deleted).
  Restocking must skip lines whose product is gone.
- Roles exist: `@Roles('admin')` + `RolesGuard` protect the admin product
  routes. Shipping can reuse them.
- There is **no scheduler** in the API (no `@nestjs/schedule`, no queue).
- The web has `/orders` and `/orders/[id]`. The detail page is where paying
  and cancelling belong.
- The API runs as one instance today, but the roadmap goes multi-instance in
  month 3. Nothing here may assume a single process.

## 3. Goals and non-goals

**Goals (this iteration)**

1. A customer can pay for a `pending` order; a successful payment moves it to
   `paid`, exactly once, however many times the provider reports it.
2. An order unpaid 15 minutes after it was placed is cancelled and its stock
   returned — exactly once, even with several sweepers running.
3. A customer can cancel their own `pending` order, with the same restock.
4. An admin can move a `paid` order to `shipped`.
5. Only the provider can make an order `paid`: forged or replayed webhooks are
   refused, and the amount paid must match the order.

**Non-goals (later)**

- Real payment providers (Stripe, ECPay). The provider sits behind an
  interface so one can replace the simulator (§5.1).
- Refunds, and therefore cancelling a `paid` order.
- Partial payments, multiple currencies per order, stored cards.
- Emails and notifications.
- A queue for webhooks or expiry (month 2 — see §12).

## 4. The lifecycle

```
                 pay (webhook: payment.succeeded)          ship (admin)
   ┌─────────┐ ─────────────────────────────────▶ ┌──────┐ ────────────▶ ┌─────────┐
   │ pending │                                     │ paid │               │ shipped │
   └─────────┘                                     └──────┘               └─────────┘
        │
        │ cancel (customer)  or  expire (15 min, sweeper)
        ▼
   ┌───────────┐
   │ cancelled │   stock returned
   └───────────┘
```

| From      | To          | Trigger                              | Side effect     |
| --------- | ----------- | ------------------------------------ | --------------- |
| `pending` | `paid`      | verified `payment.succeeded` webhook | `paidAt` set    |
| `pending` | `cancelled` | customer cancels                     | stock returned  |
| `pending` | `cancelled` | `expiresAt` has passed (sweeper)     | stock returned  |
| `paid`    | `shipped`   | admin                                | `shippedAt` set |

Every other transition is illegal. `shipped` and `cancelled` are terminal.

A **failed** payment is not a transition. The order stays `pending`, and the
customer may try again until it expires. Failing the order would release stock
the customer was about to retry for.

### 4.1 Every transition is a conditional update

The rule from checkout carries over unchanged: **never read, decide, then
write.** A transition is one statement whose `WHERE` names the state it leaves:

```sql
UPDATE "Order" SET status = 'paid', "paidAt" = now()
WHERE id = $1 AND status = 'pending';
-- 1 row: this call made the transition.  0 rows: someone else already did.
```

In Prisma that is `order.updateMany({ where: { id, status: 'pending' }, … })`
and a check of `count`. This is what makes the races in §8 safe: when payment
and expiry arrive together, both run this shape of statement against the same
row, Postgres serialises them on the row lock, and exactly one sees
`status = 'pending'`.

### 4.2 Why 15 minutes, and where it is stored

`expiresAt` is written at checkout as `createdAt + 15 min` rather than derived
at read time. That makes the deadline a fact of the order: changing the
setting later does not silently shorten or extend orders already placed, and
the sweeper's query is a plain indexed comparison.

## 5. The payment provider

### 5.1 A simulator, behind an interface

We build **MockPay**, a fake provider, instead of integrating Stripe or ECPay.
The point of this feature is how our side behaves when the provider is slow,
repeats itself, or arrives out of order — and a simulator lets tests produce
each of those on demand. A real sandbox only produces them by luck.

It stays honest by talking to the API **only over HTTP**, exactly as a real
provider would: it never imports our services or touches our database.

```ts
// apps/api/src/payments/payment-provider.ts
abstract class PaymentProvider {
  /** Start a payment; returns where to send the customer's browser. */
  abstract createSession(input: {
    orderId: string;
    amountCents: number;
    currency: string;
    expiresAt: Date;
    /** Names this attempt: /orders/:orderId/payments/:paymentId (§9). */
    returnUrl: string;
  }): Promise<{ providerSessionId: string; redirectUrl: string }>;

  /** Prove a webhook came from the provider and parse it, or throw 400. */
  abstract verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): PaymentWebhookEvent;
}

/** A provider's webhook, verified and in our terms. */
interface PaymentWebhookEvent {
  id: string; // the provider's event id: what a redelivery repeats
  type: 'payment.succeeded' | 'payment.failed';
  providerSessionId: string;
  amountCents: number;
  currency: string;
}
```

An abstract class rather than an interface because it is also the Nest
injection token: interfaces do not exist at runtime. Swapping in Stripe later
means one new class implementing this, not a change to orders or payments.

`PaymentWebhookEvent` is named apart from the `PaymentEvent` table (§6), which
only records the ids of events we have handled. It carries no order id: the
payment is found by its session, and the order through the payment — never by
what the provider says the order is.

**Where MockPay lives** (decided): a Nest module (`apps/api/src/mockpay`)
mounted under `/mockpay`, and left out of `AppModule` in production. A separate
app would be more realistic but doubles the deploy and dev setup for no extra
learning — the HTTP-only rule already keeps the boundary real.

**The client is the adapter.** `MockPayProvider` (`apps/api/src/payments`) is
the one place that knows MockPay's format. It turns our request into MockPay's
and MockPay's answer into ours, and treats that answer as outside input:

- **Validated, not cast.** MockPay's response is parsed with a Zod schema
  declared on our side, not imported from `mockpay/`. A malformed answer fails
  here instead of leaving an undefined session id in the database.
- **Bounded.** Each call times out after 5 seconds, so a provider that hangs
  does not hang the customer's request.
- **One failure for the customer.** Unreachable, timed out, an error status,
  an unreadable answer: all are `502`, the detail goes to the log, and no
  `Payment` row is written.

Configuration: `PAYMENT_PROVIDER` (only `mockpay` so far) chooses the
implementation in `PaymentsModule`, which **refuses to boot with `mockpay` in
production** — MockPay is not mounted there and takes no real money, so the
mistake shows at deploy rather than when a customer presses Pay.
`MOCKPAY_URL` is optional: unset, the client calls this API itself, at the port
it is listening on, read per call because e2e suites listen on a random port.

**Dependency direction.** Payments depend on orders, never the reverse: an
order does not need to know how it gets paid for. `payments/` owns the
`Payment` table and its routes, which share the `/orders` prefix because they
read as actions on an order.

### 5.2 What MockPay does

1. `POST /mockpay/sessions` validates what the merchant sends, stores a
   session, and answers `{ sessionId, checkoutUrl }`. These are MockPay's own
   names, deliberately not ours (`providerSessionId`, `redirectUrl`), so the
   adapter has to translate as it would for a real provider. Session ids are
   prefixed `mps_`, and sessions live in memory: MockPay must not share our
   database, and losing them on restart is fine for a stand-in.
2. `GET /mockpay/checkout/:sessionId` shows the amount and two buttons,
   **Pay** and **Decline**. Everything the merchant sent is HTML-escaped before
   it reaches the page.
3. Each button POSTs to `/mockpay/checkout/:sessionId/pay` or `/decline`, which
   records the outcome and answers **`303`** to `returnUrl` — `303` because the
   button was a POST and the browser must follow with a GET. **And separately**
   it schedules a webhook — `payment.succeeded` or `payment.failed` — to the
   merchant. The redirect never waits for the webhook, so either can arrive
   first (§9.1).
4. A session is settled once (`409` after that) and carries the order's
   `expiresAt`; after it, the session refuses to pay (`410`). An unknown
   session is `404`.

**Delivering webhooks** works as a real provider's does, because that is what
our side has to survive:

- **Signed** with the §5.3 scheme. The signing is written inside `mockpay/`,
  not shared with the verifying code in `payments/`: the two sides of a
  provider integration share a scheme, never code.
- **At least once.** Anything but a `2xx` — an error status, a timeout after
  5 seconds, no connection — is retried, after 0.5 s and then 2 s, three
  attempts in all; then MockPay gives up and logs it. A real provider keeps
  trying for days; a stand-in only needs to show that it retries.
- **The same event, each time.** Every retry repeats the event id (`mpe_…`)
  and the exact body bytes, which is what lets our side recognise a
  redelivery (§8.1). Each attempt is **signed afresh**, so a retry made
  minutes later still falls inside the timestamp window.
- **Where:** `MOCKPAY_WEBHOOK_URL` — what a merchant would enter in a real
  provider's dashboard. Unset, this API's own `/payments/webhook`, at the port
  it is listening on.
- Pending deliveries are cancelled when the app shuts down, so nothing outlives
  it — tests included.

**One test knob, not three.** The plan had per-session knobs for the webhook
delay, **deliver twice**, and **deliver out of order**. Only the delay was
built: the webhook tests sign events and send them to our endpoint
themselves, which produces a redelivery or a `failed` after a `succeeded`
exactly and at once — the knobs would have produced the same cases through
asynchronous delivery and timing. `webhookDelayMs` is an optional field on
`POST /mockpay/sessions` (default **1 second**, which our client never
overrides). The default is deliberate: the customer is usually back before the
result arrives, the order a real provider tends to produce and the one the
return page must handle — a zero delay in one process would hide that path
in development.

### 5.3 Webhook authentication

Anyone can POST to a public URL, and a webhook moves money-bearing state, so it
must prove it came from the provider:

```
MockPay-Signature: t=1727170000,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
```

- Signed over the **raw bytes**, not re-serialised JSON — re-serialising can
  reorder keys and break the signature. Nest needs `rawBody: true`.
- Compared with `crypto.timingSafeEqual`, so response time leaks nothing about
  how much of the signature matched.
- `t` more than 5 minutes from now is refused — either way: older, so a
  captured webhook cannot be replayed later; newer, so a forged future
  timestamp cannot stretch that window.
- **The signature is checked before the body is parsed.** Nothing from an
  unproven sender is read, let alone trusted.
- **Every signature failure is the same `400 Invalid webhook signature`.** The
  reason — missing, stale, mismatched — goes to the log only; telling the
  sender which check failed would help a forger adjust.
- A signed but unreadable body is `400 Malformed webhook payload`, logged
  loudly: it means the two sides disagree on the format. The body's Zod schema
  requires only the fields we read, so a provider adding or dropping a field
  we ignore does not get its webhooks refused.
- The secret is `MOCKPAY_WEBHOOK_SECRET`, required and validated at boot, with
  **no default** — a secret with a default is public. Tests and CI read a
  test-only value from the committed `.env.test`.

This is Stripe's scheme, deliberately, so it is the scheme you would explain in
an interview.

## 6. Data model

```prisma
enum PaymentStatus {
  pending    // session created, customer has not finished
  succeeded
  failed
}

enum CancelReason {
  customer
  expired
}

model Order {
  // …existing fields…

  /// Deadline to pay, fixed at checkout (createdAt + 15 min). See §4.2.
  expiresAt    DateTime
  paidAt       DateTime?
  shippedAt    DateTime?
  cancelledAt  DateTime?
  cancelReason CancelReason?

  payments     Payment[]

  /// The sweeper's query: pending orders past their deadline.
  @@index([status, expiresAt])
}

model Payment {
  id                String        @id @default(uuid())
  orderId           String
  order             Order         @relation(fields: [orderId], references: [id], onDelete: Restrict)

  /// The provider's id for this attempt. Unique: one row per session.
  providerSessionId String        @unique
  status            PaymentStatus @default(pending)
  /// What the provider was asked to collect — checked against the webhook.
  amountCents       Int
  currency          String
  /// The provider's payment page, so pressing Pay again while this attempt is
  /// open returns the same page instead of opening a second one.
  redirectUrl       String

  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@index([orderId])
  // Plus, in SQL only: UNIQUE ("orderId") WHERE status = 'pending' (below).
}

/// Every webhook we have acted on. The primary key is what makes a
/// redelivery a no-op — the same device as the idempotency key on checkout.
model PaymentEvent {
  id              String   @id  // the provider's event id, not ours
  type            String        // the provider's name for it, for tracing
  receivedAt      DateTime @default(now())
}
```

**`PaymentEvent` has no relation to `Payment`:** an event naming a session we
don't know is recorded too, so its redelivery is not processed again either.
A redelivery is recognised by the insert failing on `PaymentEvent_pkey` — the
same `violatesUniqueIndex` check checkout and starting a payment use, pinned
by its own test since the error's shape is Prisma's to change.

**Why a `Payment` table and not columns on `Order`:** an order can have several
attempts — declined card, then a second try — and each needs its own provider
id so a late webhook for attempt 1 is not mistaken for attempt 2.

**At most one pending attempt per order** — a partial unique index, added in
its own migration (`one_pending_payment_per_order`) because Prisma's schema
cannot express one:

```sql
CREATE UNIQUE INDEX "Payment_orderId_pending_key"
  ON "Payment" ("orderId") WHERE status = 'pending';
```

Two Pay presses at once both find no pending attempt and both open a provider
session; without the index, both rows are inserted and the customer has two
payment pages for one order — and can pay twice. With it, the second insert
fails and that request answers with the first one's page. **Partial**, because
failed and succeeded attempts must not count: a declined card has to be
retryable. **An index, not a lock:** locking the order would hold the lock
across the provider call, so a slow provider would block cancel and the
sweeper on that order. The losing request leaves an unused session at the
provider, which is harmless — nobody is sent to it, and it expires with the
order.

**Fields that must agree with `status`** are CHECK constraints, also in SQL
only: `cancelledAt` and `cancelReason` are set exactly when an order is
`cancelled`; `paidAt` exactly when it is `paid` or `shipped`; `shippedAt`
exactly when it is `shipped`. A test or a manual edit that sets a status
without its timestamp is refused by the database.

**Existing rows:** the migration backfills `expiresAt = createdAt + 15 min`.
Every existing `pending` order is therefore already expired, and the first
sweep cancels them and returns their stock — which is the correct outcome for
orders nobody can pay for.

## 7. API

| Method & path                         | Who               | What                                                |
| ------------------------------------- | ----------------- | --------------------------------------------------- |
| `POST /orders/:id/payment`            | the order's owner | start a payment; returns `{ redirectUrl }`          |
| `GET /orders/:id/payments/:paymentId` | the order's owner | one attempt's status, with its order's status       |
| `POST /orders/:id/cancel`             | the order's owner | cancel a `pending` order; returns the order         |
| `POST /payments/webhook`              | the provider      | signed event; `2xx` once handled or already handled |
| `GET /admin/orders?status=paid`       | admin             | orders waiting to ship, cursor-paginated            |
| `POST /admin/orders/:id/ship`         | admin             | `paid` → `shipped`; returns the order               |

**Errors** follow the checkout contract (a `code` the web branches on):

- `409 ORDER_NOT_PENDING` — pay or cancel on an order that already left
  `pending`. The body carries the current `status` so the page can re-render.
- `409 ORDER_EXPIRED` — pay after `expiresAt`, even if the sweeper has not run
  yet. The deadline is the deadline; the sweeper is only cleanup.
- `409 ORDER_NOT_PAID` — ship anything that isn't `paid`.
- `404` — someone else's order, as in `GET /orders/:id`.
- `502` — the provider could not be reached or answered badly (§5.1). Nothing
  is recorded, so pressing Pay again starts cleanly.

**The webhook answers `2xx` for anything it has already processed.** Providers
retry on non-`2xx`; answering a redelivery with an error would make it retry
forever. `400` only for a bad signature or an unparseable body — things a retry
cannot fix.

**`POST /orders/:id/payment` is safe to repeat:** if the order has a `pending`
`Payment`, it returns that payment's page instead of starting a second one —
`201` when it started a payment, `200` when it returned the pending one, the
same rule as checkout. The lookup only saves a provider call; requests that
arrive together both miss it, and the partial unique index (§6) decides which
attempt is kept. The deadline and status checks come first, so an order that
can no longer be paid never gets its old page back.

**`GET /orders/:id/payments/:paymentId`** answers
`{ id, status, order: { id, status } }` and nothing more: the return page polls
it every 2 seconds (§9.1), and those two statuses are all it branches on. The
order's lines are read once from `GET /orders/:id`. The payment must belong to
the order and the order to the user, checked in one query, so anything else is
`404`.

**The `Payment` id exists before the session does.** The return URL has to name
the attempt (§9), but the provider only hands back its session id once asked.
So the API generates the `Payment` id first, builds the return URL from it,
calls `createSession`, and then inserts the row with both ids.

## 8. Algorithms

### 8.1 Handling a webhook

`WebhooksController` takes the raw body (the app is created with
`rawBody: true`), and `PaymentsService.handleWebhook` does the rest:

1. Verify the signature (§5.3) — before anything touches the database. `400`
   if it fails.
2. Open one transaction with `INSERT INTO "PaymentEvent" (id, …)`. On a
   unique violation this event was already handled: the transaction rolls
   back and we answer `200`. A copy arriving while the first is still running
   waits on the key, then fails the same way.
3. Find the `Payment` by `providerSessionId`. Unknown → `200` and log it; it is
   not ours, or it predates us, and a retry will not change that.
4. `payment.succeeded`:
   - Amount or currency differs from the `Payment` row → mark the payment
     `failed` **if it is still `pending`**, log loudly, leave the order alone.
   - Otherwise mark the payment `succeeded` — **even over an earlier
     `failed`** for the same session, since the money has been taken — then
     run the `pending → paid` conditional update (`markPaid`, §4.1) in the same
     transaction, so payment and order change together or not at all.
   - 0 rows updated means the order was no longer `pending`: cancelled first
     (§8.4), or already paid by another attempt. Either way the money is
     recorded as `succeeded` and logged as one to refund.
5. `payment.failed`: mark the payment `failed` **only if it is still
   `pending`**. A `failed` arriving after `succeeded` changes nothing.

Any other error — the database, say — rolls back the event record as well, so
the provider's retry is processed afresh instead of being taken for a
redelivery. That is also why only "a retry could not change this" answers
`200` and real failures answer `500`.

The endpoint is not throttled (`@SkipThrottle`): a provider can deliver in
bursts, and a dropped webhook is a payment we do not hear about until it is
resent. It needs no login guard; the signature is the authentication.

**Known limitation.** `failed` does not record why: a decline and a refused
amount look the same. So a later correct `succeeded` for the same session
turns a refused payment into `succeeded`. One session reporting two different
amounts means the provider itself is broken, so this is left until it
matters; a failure reason on `Payment`, or a separate `rejected` status that a
success cannot overwrite, would close it.

### 8.2 Cancelling (customer or sweeper)

One function, `cancelOrder(orderId, reason)`, used by both:

1. `pending → cancelled` conditional update, setting `cancelledAt` and
   `cancelReason`. 0 rows → return; someone else finished this order.
2. Only if step 1 changed a row: increment `stock` for each `OrderItem` whose
   `productId` is not null.

Both steps in one transaction. Step 2 depends on step 1's row count, and that
is what guarantees stock is returned **once**: a second canceller loses at
step 1 and never reaches step 2. Doing the increment unconditionally would
return the same copies twice.

### 8.3 The expiry sweeper

Every minute:

```sql
SELECT id FROM "Order"
WHERE status = 'pending' AND "expiresAt" < now()
ORDER BY "expiresAt"
LIMIT 100;
```

…then `cancelOrder(id, 'expired')` for each, one at a time. An order that
fails is logged and left `pending` for the next sweep; it does not stop the
rest of the batch. Scheduled with `@nestjs/schedule`, which is not loaded
under test: a sweep firing mid-test would cancel orders a test is still racing
on, so tests call the sweep directly.

**Safe on any number of instances without coordination:** two instances may
select the same orders, but `cancelOrder` lets only one of them win each order.
The cost of a duplicate sweep is a few wasted statements, not wrong stock. A
queue or `SELECT … FOR UPDATE SKIP LOCKED` would remove the wasted work; not
worth it at this size (§12).

### 8.4 ⚖️ The race: paid after cancelled

The provider can capture money for an order we have just cancelled: the
customer presses **Pay** at 14:59, the webhook lands at 15:02, and the sweeper
cancelled the order at 15:00. The `pending → paid` update matches 0 rows —
correctly, since the stock is already back on sale — but the customer has
paid.

Two defences, both in this iteration:

1. **The session expires with the order.** MockPay refuses to pay after the
   `expiresAt` it was given, which shrinks the window to a payment already in
   flight at the deadline.
2. **What is left is recorded, not hidden.** The payment stays `succeeded`
   against a `cancelled` order, and an admin query lists exactly those — money
   to hand back by hand until refunds exist. _(Recorded and logged since step
   5; the admin list comes with step 6.)_

The real fix is **authorise, then capture**: the provider only _holds_ the
money; we capture after the `pending → paid` update wins, and void the hold if
it loses. Stripe supports this (`capture_method: manual`). It needs two provider
calls and another state, so it is left for when refunds arrive.

## 9. Web

**Order detail (`/orders/[id]`)**

- `pending`: a countdown to `expiresAt`, **Pay now** and **Cancel order**.
- `paid` / `shipped` / `cancelled`: the status and its timestamp; a cancelled
  order says whether it expired or was cancelled.

### 9.1 The payment return route

After **Pay** or **Decline**, MockPay sends the browser to:

```
/orders/[id]/payments/[paymentId]
```

**Why the attempt is in the path.** An order can have several attempts — a
declined card, then a second try. A return URL that only says "you came back"
(`/orders/[id]?payment=returned`) cannot tell attempt 1's decline from attempt
2's success, so a slow webhook for the first could be shown as the result of
the second. Naming the attempt means the page asks about exactly the payment
the customer just made.

**Route shape.**

- **Plural `/orders`**, matching the existing `/orders` and `/orders/[id]`
  routes and the API.
- **A named `payments/` segment** under the order detail: the result page is a
  child of `/orders/[id]`, not a second mode of it, and the path reads as "this
  order's payment".

**What the page does.** The redirect **proves nothing** — anyone can type the
URL — so the page never shows "paid" because it was reached. It renders the
order and polls `GET /orders/:id/payments/:paymentId` every 2 seconds:

| Payment     | Order       | Page shows                                                  |
| ----------- | ----------- | ----------------------------------------------------------- |
| `pending`   | `pending`   | "Confirming your payment…" (keep polling)                   |
| `succeeded` | `paid`      | the paid order                                              |
| `failed`    | `pending`   | "Payment declined", with **Pay now** to start a new attempt |
| `succeeded` | `cancelled` | "Paid after the order expired — we will refund you" (§8.4)  |

It stops after 30 seconds with "Still processing — refresh later". Only the
webhook changes these statuses; the page only reads them.

**Another customer's payment id** is a `404`, and so is a `paymentId` that
belongs to a different order — the same rule as `GET /orders/:id`.

**Route file:** `apps/web/app/(routes)/orders/[id]/payments/[paymentId]/page.tsx`,
kept thin as usual — it reads the params and hands rendering to a component
under `app/_components/`.

**Later:** if paying grows its own UI on our side — choosing a method,
installments, invoice details — it gets a dedicated page such as
`/orders/[id]/pay`. While MockPay hosts the form, a button on the order detail
is enough.

### 9.2 Admin

A list of `paid` orders with a **Mark shipped** button per row.

## 10. Testing

Against the real test database, as with checkout — every guarantee here is a
row lock or a unique index, which a mock would pass while proving nothing.

**State machine**

- Pay, cancel and ship succeed only from their one legal state; each illegal
  pair returns its `409` code.
- Paying after `expiresAt` is `ORDER_EXPIRED` before the sweeper has run.

**Webhooks** — the tests sign events and send them to the endpoint
themselves, so they choose exactly what arrives and when (§5.2)

- A wrong secret, a timestamp too old or too far ahead, a modified body, and a
  missing or malformed header are each `400` and change nothing; so is a
  signed body that is not a webhook. _(webhook-signature, webhooks specs)_
- The same event delivered twice, and **five copies at once**: one transition,
  one `PaymentEvent` row, all `200`s.
- `failed` after `succeeded` leaves the order `paid`; `succeeded` after
  `failed` pays it.
- An amount mismatch leaves the order `pending` and the payment `failed`.
- A session we don't know is `200` and recorded.

**MockPay's delivery** — what it sends, captured by replacing `fetch`

- Pay and Decline each send the right event type, to `/payments/webhook`,
  signed with the secret.
- The redirect returns before the webhook is sent.
- A webhook answered `500` is retried as **the same event id**, each attempt
  validly signed; after three attempts it stops.
- End to end, nothing replaced: pressing Pay pays the order, pressing Decline
  fails the payment and leaves the order payable.

**Restock exactly once**

- Customer cancel and sweeper cancel fired together (`Promise.all`, several
  rounds like the checkout races): one `cancelled`, stock returned once.
- A deleted product's line is skipped, and the rest are restocked.

**Payment vs expiry**

- Webhook and sweeper fired together, five rounds: the order ends either
  `paid` with stock still taken, or `cancelled` with stock returned — never
  both, never neither — and the payment is `succeeded` either way.
- A success landing after the order was cancelled is recorded and leaves the
  order `cancelled`. _(Its appearance in the "paid but cancelled" admin query
  waits for step 6.)_

**Payment return (§9.1)**

- A declined attempt followed by a successful one: each attempt's
  `GET /orders/:id/payments/:paymentId` reports its own result, even when the
  first attempt's webhook arrives last.
- Another customer's payment, and a payment id under the wrong order, are `404`.
- The return URL MockPay receives names the `Payment` row that was inserted.

**Time** is not injected. An expiry test places an order normally and then
moves its `expiresAt` into the past, which is the state the sweeper and the
`ORDER_EXPIRED` check actually read. A `Clock` provider would do the same job
with one more abstraction; it is worth adding only if a test needs to assert
on a time the code computes from "now" and backdating cannot express it.

## 11. Implementation order

1. Migration: `expiresAt` with backfill, `cancelledAt`, `cancelReason`, the
   sweeper index. Shared contract gains the new fields. _(Done, #26.)_
2. `cancelOrder` + `POST /orders/:id/cancel`, with the restock-once tests.
   _(Done, #26.)_
3. The sweeper, with the expiry tests. _(Done, #27.)_
4. Migration: `paidAt`, `shippedAt`, `Payment`, and the one-pending-payment
   index. Then `PaymentProvider`, MockPay, `POST /orders/:id/payment`,
   `GET /orders/:id/payments/:paymentId`. _(Done, #31–#37.)_ Built
   outside-in: the endpoint first against a fake provider, then MockPay, then
   the client that connects them.
5. `PaymentEvent`, `verifyWebhook`, the webhook itself, and MockPay's
   webhooks, with the signature, duplicate and race tests. _(Done, #39–#42.)_
   `PaymentEvent` moved here from step 4: only the webhook uses it, so it
   arrives with its first caller. Built in small merged steps: the table, the
   signature check, the endpoint against hand-signed webhooks, then MockPay
   sending them — the payment flow worked end to end only at the last. Only
   one of the three planned test knobs was built (§5.2).
6. Admin list and ship.
7. Web: detail page actions, the payment return route (§9.1), admin page.

Cancelling comes first because it is the smallest complete use of the new
lifecycle, and the sweeper and the late-payment race both build on it.

## 12. Open questions

1. ~~MockPay as a module inside the API, or its own app from the start?~~
   Decided: a module, mounted outside production only (§5.1).
2. ⚖️ Accept the paid-after-cancelled window with an admin list (§8.4), or do
   authorise/capture now?
3. Should the sweeper also run lazily — expire an order when it is read after
   its deadline — so the UI never shows a stale `pending` for up to a minute?
4. Month 2: move webhook handling onto a queue (answer `200` immediately,
   process in a worker) and the sweeper onto `SKIP LOCKED` or delayed jobs?
5. Should cart quantities be capped at stock now that stock is released
   automatically, so fewer checkouts fail with a short line?

## 13. Interview talking points

- **"How do you model an order lifecycle?"** → an explicit state machine where
  every transition is a conditional update on the state it leaves (§4.1).
- **"The webhook arrives twice — what happens?"** → the event id has a unique
  index; the second insert fails and we answer `200` (§8.1). Same idea as the
  checkout idempotency key.
- **"Why not mark the order paid when the user returns from the payment
  page?"** → the redirect is client-controlled; only a signed server-to-server
  message is evidence (§5.3, §9).
- **"Payment succeeds just as the order expires?"** → one row, two conditional
  updates, one winner; the leftover case is recorded, and authorise/capture
  closes it for good (§8.4).
- **"How do you run a cron job on ten instances?"** → make the job idempotent
  so running it ten times is merely wasteful, then remove the waste with
  `SKIP LOCKED` or a queue if it matters (§8.3).
- **"Why sign the raw body?"** → JSON re-serialisation is not byte-stable; the
  signature must cover exactly what was sent (§5.3).
- **"What does at-least-once delivery mean for the sender?"** → retry anything
  not acknowledged, always as the same event id — that id is the only thing
  that lets the receiver recognise a redelivery — and sign each attempt afresh
  so a late retry still fits the receiver's time window (§5.2).
- **"Why `timingSafeEqual` and not `===`?"** → `===` stops at the first
  differing byte, so response time reveals how much of a guessed signature was
  right; a constant-time compare reveals nothing (§5.3).
