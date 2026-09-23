# Idempotent checkout

- **Status:** Draft — decisions marked ⚖️ are open
- **Date:** 2026-09-23
- **Scope:** making `POST /orders` safe to send twice, so a retry returns the
  order that was already placed instead of a second one or an error
- **Follows:** [checkout-orders.md](./checkout-orders.md) §7.4

## 1. Why this feature

Checkout already survives two tabs: both requests read the same cart lines,
and only the one that deletes them may order (`claimCartItems`). What it does
not survive is a **retry**, which is the ordinary case on a mobile network:

```
client ──POST /orders──▶ server: order placed, stock taken, cart emptied
       ◀──────╳───────── response lost (timeout, dropped connection, sleep)
client ──POST /orders──▶ server: the cart is empty now → 409 CART_EMPTY
```

The customer is told their cart is empty and has no idea whether they bought
anything. The mirror case is worse: retry while the first request is still
running, and the cart still has its lines, so a **second, genuine duplicate
order** is created and charged for.

This is not a checkout quirk. Any network delivers **at least once**: a client
that doesn't hear back cannot tell "never arrived" from "arrived, answer lost",
so it must retry, and the server must be able to recognise the retry. The fix
is an idempotency key, the same mechanism Stripe puts on every mutating call.

| Concept                         | Where it appears                                   |
| ------------------------------- | -------------------------------------------------- |
| At-least-once delivery          | why a retry is correct client behaviour            |
| Idempotency keys                | client-generated id identifying one attempt        |
| Unique constraints as decisions | the index picks the winner, not application code   |
| Exactly-once _effects_          | the order is created once however often it is sent |

## 2. Where we are today

- `POST /orders` takes **no body**: the server reads the cart itself
  (`OrdersService.checkout`). So two requests are indistinguishable — there is
  nothing on the wire that says "this is the same attempt as before".
- One transaction does everything: claim cart lines, decrement stock, insert
  the order. All of it rolls back together.
- Duplicate submits are caught by `claimCartItems`: whoever deletes the cart
  rows owns them, and the loser gets 409 `CART_CHANGED`.
- The web sends checkout from `useCreateOrder`. React Query does **not** retry
  mutations by default, so today every retry is a human pressing the button
  again.

## 3. Goals and non-goals

**Goals**

1. Sending the same checkout twice creates **one** order.
2. The retry gets that order back, not an error.
3. Stock is taken once, and the cart is emptied once.
4. Checkouts that send no key keep working exactly as now.

**Non-goals (later, if a third route needs them)**

- A general idempotency layer for every mutating route
- Storing and replaying whole responses, including error responses
- Keys on cart writes (`PATCH /cart/items/:id` already sets an absolute
  quantity, so sending it twice lands on the same number)
- Expiring keys

## 4. The contract

The client generates a key per **attempt** and sends it as a header:

```http
POST /orders
Idempotency-Key: 6f1a...-uuid
```

- **One attempt, one key.** Every retry of that attempt carries the same key.
  Pressing "Place order" again after fixing a short line is a _new_ attempt and
  gets a new key.
- **Optional.** No key means today's behaviour. That keeps this change
  backward compatible and keeps the server honest: the key is a client's tool
  for recognising its own retries.
- **Scoped to the user.** Keys are unique per customer, never globally, so one
  customer's key can neither collide with nor probe another's.

Responses:

| Case                                               | Status                     | Body                   |
| -------------------------------------------------- | -------------------------- | ---------------------- |
| First use of the key                               | 201                        | the new order          |
| Key already used by this customer                  | 200                        | the **original** order |
| Key in flight (the first request hasn't committed) | 409 `CHECKOUT_IN_PROGRESS` | error code             |
| No key                                             | 201                        | as today               |

200 rather than 201 on a repeat says plainly that nothing new was created. The
web treats both as success and navigates to the order.

## 5. Data model ⚖️

**Decision: a column on `Order`, not a general table.**

```prisma
model Order {
  // …
  /// Client-generated id for one checkout attempt. Null for checkouts that
  /// sent no key. Unique per customer: a repeat lands on the order the first
  /// attempt created.
  idempotencyKey String?

  @@unique([userId, idempotencyKey])
}
```

| Option                                      | Cost                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Column on `Order`** ✅                 | One migration. Only covers checkout.                                                                                                  |
| B. `IdempotencyRecord` table with responses | Works for any route, replays error responses too — and needs an expiry policy, a cleanup job, and a serialised copy of every response |

**Why A.** An order _is_ the record of the request that created it, so a
retry is answered by looking the order up. There is no second thing that can
disagree with it, nothing to expire, and no snapshot to keep in step with the
response shape. B is what to build when a second and third route need keys;
that is the moment, not before.

**Why `null` is safe.** Postgres treats nulls as distinct in a unique index,
so any number of orders may have no key. Only real keys compete.

**Storage.** One uuid per order, kept for the order's life. No cleanup job; a
key that is never retried simply sits there, and answering a retry a year later
is correct behaviour rather than a leak.

## 6. Algorithm

```
1. read the key from the header (absent → straight to today's checkout)
2. fast path: SELECT order WHERE userId = ? AND idempotencyKey = ?
              found → 200, return it (no transaction, no cart touched)
3. run the existing checkout transaction, writing the key onto the order
4. on unique violation (P2002 on userId_idempotencyKey):
      re-read by key → found → 200, return it
                     → not found → 409 CHECKOUT_IN_PROGRESS
```

Step 2 is only an optimisation — it saves doing the work — and step 4 is what
makes it correct. That split matters: the read in step 2 can be stale, so it
can never be the thing that decides. The decision is the unique index, which
is checked at write time, exactly like `claimCartItems` letting the DELETE
decide rather than a preceding SELECT (checkout-orders.md §7.1).

### 6.1 The three cases

**First use.** No row matches, the transaction runs, the order is inserted with
the key. 201.

**Retry after the first finished.** Step 2 finds the order and returns it. No
lock is taken, no stock moves, the cart isn't touched. Note the cart _is_ empty
by now — and that no longer matters, because we never reach the cart check.

**Retry while the first is still running.**

```
request A                          request B (same key)
─────────                          ────────────────────
SELECT by key → none               SELECT by key → none   (A hasn't committed)
BEGIN                              BEGIN
claim cart lines, take stock       blocks on the cart rows A holds
INSERT order (key)                 …
COMMIT ─────────────────────────▶  wakes: cart rows gone → CART_CHANGED
                                   → ROLLBACK
                                   re-read by key → found → 200 + A's order
```

B fails inside the transaction for the reason it already would, then the
**handler** re-reads by key and answers with A's order. If B happens to get
past the cart claim and reach the INSERT, the unique index stops it there
(P2002) and the same re-read answers it.

The one gap: if B's re-read runs before A commits — B failed early, A is still
writing — there is nothing to return yet. That's the 409
`CHECKOUT_IN_PROGRESS`: honest ("your earlier request is still being
processed"), and the client retries in a moment and gets the order.

### 6.2 Failed attempts do not consume the key

If checkout fails (short stock, mixed currency), the transaction rolls back and
**no row carries the key**. So the same key can be sent again and will be
treated as a fresh attempt.

That is deliberate with option A: the key marks "this attempt produced that
order", not "this key was seen". It means we do not replay error responses —
a retry after a short-stock 409 re-runs the checkout, which is what a customer
who just changed their cart wants. The cost is that a client which retries a
_deterministic_ failure gets the failure computed again, which is cheap.

## 7. API

```ts
// packages/shared/src/order.ts
/** Header carrying the client's id for one checkout attempt. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

export const orderErrorCodeSchema = z.enum([
  'CART_EMPTY',
  'INSUFFICIENT_STOCK',
  'MIXED_CURRENCY',
  'CART_CHANGED',
  'CHECKOUT_IN_PROGRESS', // new
]);
```

**Validation.** A key is a non-empty string, at most 200 characters. Anything
longer is a 400: keys are stored, so their size is the API's business. The
format is otherwise the client's choice (uuid, ULID), because the server never
parses one — it only compares.

**Why a header, not the body.** `POST /orders` deliberately has no body (the
server reads the cart, so the client cannot misreport it). A key is metadata
about the request rather than part of the order, and `Idempotency-Key` is the
name every client library already knows.

## 8. Web

An attempt is one press of "Place order" plus any retries of that press, and
the browser is what decides two requests are the same attempt: it holds the key
between them. The server only compares keys.

```ts
// useCreateOrder
const key = readStoredKey() ?? storeKey(crypto.randomUUID());
createOrder.mutate(key);
```

### 8.1 When the key is kept, and when it is dropped

What came back decides, and the useful line is between "no answer" and "an
answer":

| Response                                 | What it means                   | Key      |
| ---------------------------------------- | ------------------------------- | -------- |
| Timeout, dropped connection, no response | the server **may** have done it | **keep** |
| 201 / 200                                | done                            | clear    |
| 409 short stock, mixed currency, 4xx     | a definite no, nothing happened | clear    |

Keeping it after a lost response is the whole point: pressing again asks "did
my earlier request land?" and gets the order back. Clearing it after a definite
answer is just as deliberate — the customer is about to lower a quantity and
press again, which is a **new attempt** and deserves its own key. (With a
column on `Order`, a failed checkout writes no row, so reusing the key there
would be harmless; dropping it keeps "one key, one attempt" true rather than
almost true.)

### 8.2 Surviving a reload

A key in a `useRef` lives only as long as the page. A customer who sees nothing
happen and **reloads** would generate a new key on the next press, losing the
protection exactly when they are most likely to press again.

So the key is stored in `sessionStorage` under a fixed name, read back on the
next press, and removed when the attempt ends. `sessionStorage` rather than
`localStorage`: an attempt belongs to a tab, and a stale key should not outlive
the tab that made it.

Even without it there is no duplicate order — if the first request succeeded
the cart is empty, so a fresh checkout is refused with `CART_EMPTY` — but the
customer is told their cart is empty rather than shown what they bought. The
whole point is to answer that question properly.

The confirmation page needs no change: a 200 and a 201 both carry the order.

## 9. Testing

Against real Postgres, as with checkout:

- **The same key twice** → one order, the same id both times, 201 then 200,
  stock taken once
- **The same key twice at the same moment** (`Promise.all`) → one order; the
  loser answers with it, or with 409 `CHECKOUT_IN_PROGRESS`
- **Different keys, one cart** → the second fails as today, the cart having
  been consumed (`CART_EMPTY` / `CART_CHANGED`)
- **Two customers, the same key string** → two independent orders, proving the
  unique is per user
- **No key** → unchanged
- **A key reused after a short-stock 409** → runs a fresh checkout rather than
  replaying the error
- **An over-long key** → 400, and no order
- **The stored key survives a remount** (the web's own behaviour): a second
  press after a simulated lost response reuses it rather than generating a new
  one

## 10. Open questions

1. ⚖️ Is 409 `CHECKOUT_IN_PROGRESS` the right answer for the narrow in-flight
   window, or should the server wait briefly and re-read before answering?
2. Should the web surface `CHECKOUT_IN_PROGRESS` at all, or retry once
   automatically after a short delay and only then show a message?
3. Do we want the same keys on `POST /cart/items` (which increments, so it is
   _not_ idempotent today), or is capping at stock enough in practice?
4. Should a key survive the tab (`localStorage` with an age limit) rather than
   only the session? Only worth it if "reopened the site and pressed again"
   turns out to be a real pattern.

## 11. Interview talking points

- **"How do you make a POST idempotent?"** → a client-generated key, stored
  with the thing it created, enforced by a unique index.
- **"Why not check whether the order exists first?"** → a read can be stale;
  the constraint is evaluated at write time. Same argument as the stock guard
  and the cart claim (checkout-orders.md §7.1–7.2).
- **"What if the retry arrives mid-flight?"** → it blocks, loses, and is
  answered from the winner's row; the narrow window where the winner hasn't
  committed is a 409 the client retries.
- **"Where would you store keys in a bigger system?"** → a dedicated table with
  the response and an expiry, once more than one route needs it; a column is
  the right size while exactly one does.
- **"Does this give exactly-once delivery?"** → no such thing over a network.
  It gives exactly-once _effects_: the message may arrive any number of times,
  and the order is still created once.
