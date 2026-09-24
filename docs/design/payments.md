# Payments & Order Lifecycle

- **Status:** Draft — decisions marked ⚖️ are open
- **Date:** 2026-09-24
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

### 5.1 ⚖️ A simulator, behind an interface

We build **MockPay**, a fake provider, instead of integrating Stripe or ECPay.
The point of this feature is how our side behaves when the provider is slow,
repeats itself, or arrives out of order — and a simulator lets tests produce
each of those on demand. A real sandbox only produces them by luck.

It stays honest by talking to the API **only over HTTP**, exactly as a real
provider would: it never imports our services or touches our database.

```ts
interface PaymentProvider {
  /** Start a payment; returns where to send the customer's browser. */
  createSession(input: {
    orderId: string;
    amountCents: number;
    currency: string;
    expiresAt: Date;
    returnUrl: string;
  }): Promise<{ providerSessionId: string; redirectUrl: string }>;

  /** Authenticate a webhook and parse it, or throw. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): PaymentEvent;
}
```

Swapping in Stripe later means one new class implementing this, not a change
to orders.

**Where MockPay lives** ⚖️: a separate Nest module (`apps/api/src/mockpay`)
mounted under `/mockpay`, enabled only outside production. A separate app
would be more realistic but doubles the deploy and dev setup for no extra
learning — the HTTP-only rule already keeps the boundary real.

### 5.2 What MockPay does

1. `createSession` stores a session and returns `/mockpay/checkout/:sessionId`.
2. That page shows the amount and two buttons: **Pay** and **Decline**.
3. On either, it redirects the browser to `returnUrl`, **and separately** POSTs
   a webhook to `POST /payments/webhook` after a configurable delay.
4. A session carries the order's `expiresAt`; after it, the page refuses to pay.

Test-only knobs, set per session: webhook delay, **deliver twice**, and
**deliver out of order** (a `payment.failed` arriving after
`payment.succeeded`). §10 uses each.

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
- `t` older than 5 minutes is refused, so a captured webhook cannot be
  replayed later.
- The secret is `MOCKPAY_WEBHOOK_SECRET`, validated at boot like the others.

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

  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@index([orderId])
}

/// Every webhook we have acted on. The unique id is what makes a redelivery a
/// no-op — the same device as the idempotency key on checkout.
model PaymentEvent {
  id              String   @id  // the provider's event id
  type            String
  receivedAt      DateTime @default(now())
}
```

**Why a `Payment` table and not columns on `Order`:** an order can have several
attempts — declined card, then a second try — and each needs its own provider
id so a late webhook for attempt 1 is not mistaken for attempt 2.

**Existing rows:** the migration backfills `expiresAt = createdAt + 15 min`.
Every existing `pending` order is therefore already expired, and the first
sweep cancels them and returns their stock — which is the correct outcome for
orders nobody can pay for.

## 7. API

| Method & path                   | Who               | What                                                |
| ------------------------------- | ----------------- | --------------------------------------------------- |
| `POST /orders/:id/payment`      | the order's owner | start a payment; returns `{ redirectUrl }`          |
| `POST /orders/:id/cancel`       | the order's owner | cancel a `pending` order; returns the order         |
| `POST /payments/webhook`        | the provider      | signed event; `2xx` once handled or already handled |
| `GET /admin/orders?status=paid` | admin             | orders waiting to ship, cursor-paginated            |
| `POST /admin/orders/:id/ship`   | admin             | `paid` → `shipped`; returns the order               |

**Errors** follow the checkout contract (a `code` the web branches on):

- `409 ORDER_NOT_PENDING` — pay or cancel on an order that already left
  `pending`. The body carries the current `status` so the page can re-render.
- `409 ORDER_EXPIRED` — pay after `expiresAt`, even if the sweeper has not run
  yet. The deadline is the deadline; the sweeper is only cleanup.
- `409 ORDER_NOT_PAID` — ship anything that isn't `paid`.
- `404` — someone else's order, as in `GET /orders/:id`.

**The webhook answers `2xx` for anything it has already processed.** Providers
retry on non-`2xx`; answering a redelivery with an error would make it retry
forever. `400` only for a bad signature or an unparseable body — things a retry
cannot fix.

**`POST /orders/:id/payment` is safe to repeat:** if the order has a `pending`
`Payment` whose session is still open, it returns that session's URL instead of
starting a second one.

## 8. Algorithms

### 8.1 Handling a webhook

One transaction:

1. Verify the signature (§5.3) — before anything touches the database.
2. `INSERT INTO "PaymentEvent" (id, …)`. On a unique violation, this event was
   already handled: commit nothing, answer `200`.
3. Find the `Payment` by `providerSessionId`. Unknown → `200` and log it; it is
   not ours, or it predates us, and a retry will not change that.
4. `payment.succeeded`:
   - Amount or currency differs from the `Payment` row → mark the payment
     `failed`, log loudly, leave the order alone.
   - Otherwise mark the payment `succeeded`, then run the
     `pending → paid` conditional update (§4.1).
   - 0 rows updated means the order was already cancelled — see §8.4.
5. `payment.failed`: mark the payment `failed` **only if it is still
   `pending`**. A `failed` arriving after `succeeded` changes nothing.

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

…then `cancelOrder(id, 'expired')` for each. Scheduled with
`@nestjs/schedule`.

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
   to hand back by hand until refunds exist.

The real fix is **authorise, then capture**: the provider only _holds_ the
money; we capture after the `pending → paid` update wins, and void the hold if
it loses. Stripe supports this (`capture_method: manual`). It needs two provider
calls and another state, so it is left for when refunds arrive.

## 9. Web

**Order detail (`/orders/[id]`)**

- `pending`: a countdown to `expiresAt`, **Pay now** and **Cancel order**.
- `paid` / `shipped` / `cancelled`: the status and its timestamp; a cancelled
  order says whether it expired or was cancelled.

**Returning from MockPay:** the browser lands on `/orders/[id]?payment=returned`.
That redirect **proves nothing** — anyone can type the URL — so the page does
not show "paid" because of it. It shows "Confirming your payment…" and polls
`GET /orders/:id` every 2 seconds until the status changes, giving up after 30
seconds with "still processing, refresh later". Only the webhook makes an order
`paid`.

**Admin:** a list of `paid` orders with a **Mark shipped** button per row.

## 10. Testing

Against the real test database, as with checkout — every guarantee here is a
row lock or a unique index, which a mock would pass while proving nothing.

**State machine**

- Pay, cancel and ship succeed only from their one legal state; each illegal
  pair returns its `409` code.
- Paying after `expiresAt` is `ORDER_EXPIRED` before the sweeper has run.

**Webhooks**

- A bad signature, a stale timestamp, and a modified body are each `400` and
  change nothing.
- The same event delivered twice: one transition, one `PaymentEvent` row, two
  `200`s.
- `failed` after `succeeded` leaves the order `paid`.
- An amount mismatch leaves the order `pending` and the payment `failed`.

**Restock exactly once**

- Customer cancel and sweeper cancel fired together (`Promise.all`, several
  rounds like the checkout races): one `cancelled`, stock returned once.
- A deleted product's line is skipped, and the rest are restocked.

**Payment vs expiry**

- Webhook and sweeper fired together: the order ends either `paid` with stock
  still taken, or `cancelled` with stock returned — never both, never neither.
- The losing-payment case appears in the "paid but cancelled" admin query.

**Time** is injected (a `Clock` provider), so expiry tests set `now` instead of
waiting 15 minutes.

## 11. Implementation order

1. Migration: `Order` timestamps, `expiresAt` with backfill, `Payment`,
   `PaymentEvent`. Shared contract gains the new fields.
2. `cancelOrder` + `POST /orders/:id/cancel`, with the restock-once tests.
3. The sweeper and the `Clock`, with the expiry tests.
4. `PaymentProvider`, MockPay, `POST /orders/:id/payment`.
5. The webhook, with the signature, duplicate and race tests.
6. Admin list and ship.
7. Web: detail page actions, return polling, admin page.

Cancelling comes first because it is the smallest complete use of the new
lifecycle, and the sweeper and the late-payment race both build on it.

## 12. Open questions

1. ⚖️ MockPay as a module inside the API (§5.1), or its own app from the start?
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
