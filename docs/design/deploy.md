# Deploying to Free Hosting

- **Status:** Proposed — nothing built yet (§10); decisions marked ⚖️ are open
- **Date:** 2026-10-22
- **Scope:** putting the web app, the API and the database on the public
  internet at no cost, and the code changes that have to come first
- **Follows:** [payments.md](./payments.md) (MockPay, the expiry sweeper, the
  cancel's void — all of which behave differently once deployed)

## 1. Why this feature

Everything so far runs on one laptop: `pnpm dev`, Postgres in Docker, one
process, one IP address, nothing ever asleep. Deploying changes each of those,
and several things that are correct locally break in ways no test here would
catch:

- **The API is behind proxies.** Every request reaches it from a proxy's
  address, so the per-IP rate limit counts all customers as one.
- **The web and the API are on different sites.** The auth cookie becomes a
  third-party cookie, which browsers increasingly refuse.
- **The API process sleeps and restarts.** Anything held only in memory —
  MockPay's sessions, scheduled sweeps, pending webhook retries — is lost.
- **The filesystem is not kept.** An uploaded image is gone after the next
  deploy.

The constraint is **no paid plans**. That rules out the usual fixes (a server
that never sleeps, a managed bucket, a pre-deploy hook) and makes each of these
a design decision instead.

| Concept                              | Where it appears                                         |
| ------------------------------------ | -------------------------------------------------------- |
| Serverless vs long-running processes | why the API can't run where the web does (§5)            |
| Same-origin proxying                 | the auth cookie stays first-party (§6.1)                 |
| Trusting proxy headers               | the rate limit sees the customer's IP, not the proxy's   |
| Stateless instances, ephemeral disks | what is lost on restart, and what that breaks (§6.3–6.5) |
| Database per service                 | MockPay keeps its own database, reached only over HTTP   |
| Reproducible builds (Docker)         | the same image locally and on the host (§8)              |
| Schema migrations as a deploy step   | the database changes before the code that needs it (§9)  |
| Secure defaults                      | MockPay stays off in production unless asked for (§6.4)  |

## 2. Where we are today

Facts from the current code, which shape the design:

- **The web calls the API from the browser only.** `app/_lib/core/http.ts`
  fetches `NEXT_PUBLIC_API_URL` with `credentials: 'include'`; nothing in the
  web reads cookies on the server.
- **Auth is a JWT in an httpOnly cookie**, `sameSite: 'lax'`, `secure` in
  production (`auth/auth.cookie.ts`). CORS allows the origins in `WEB_ORIGIN`
  with credentials.
- **The rate limit is global and per IP**: 100 requests a minute, 5 a minute
  for login and register, kept in memory (`app.module.ts`). Express's
  `trust proxy` is not set.
- **MockPay is refused in production**: `PaymentsModule` throws at boot if
  `PAYMENT_PROVIDER=mockpay` and `NODE_ENV=production`, and `MockPayModule`
  isn't mounted. There is no other provider, so a production deploy today has
  no way to pay.
- **MockPay keeps its sessions in memory** and sends webhooks with
  `setTimeout`. A restart forgets every session; voiding a forgotten one is a
  `404` from MockPay, which the client reports as `502`.
- **The expiry sweep runs in-process** every minute (`@nestjs/schedule`).
- **Uploads go to local disk** (`STORAGE_DRIVER=local`). `gcs` is accepted by
  the config but not implemented. Most product images are Discogs URLs anyway.
- **`/health`** exists and is not rate-limited.
- **No Dockerfile.** CI (GitHub Actions) uses Node 24 and pnpm 12.6.0.

## 3. Goals and non-goals

**Goals**

1. Anyone with the URL can browse, register, check out, pay with MockPay and
   cancel — the whole customer flow — on the deployed site.
2. Nothing costs money. Every service is on a free plan.
3. The API ships as a Docker image that runs the same locally and on the host.
4. A schema change reaches the database before the code that depends on it.
5. What the free plans cost us (sleeping, cold starts) is written down, with
   the reasons it is acceptable for a portfolio project.

**Non-goals**

- Real payments. MockPay stays the provider.
- A custom domain. The platforms' own subdomains are enough.
- More than one API instance. The in-memory rate limit and MockPay's webhook
  timers both assume one; Redis is the fix when that changes (Month 2).
- MockPay as a separate service. Its code is a package of its own and its data
  is separated now (§6.5); running it as its own process waits until
  free-plan limits stop making it costly (§11).
- Admin image uploads in production — until §6.6's storage exists.
- Uptime guarantees. A cold start of up to a minute is accepted (§6.3).

## 4. Architecture

```
 Browser
    │  https://<app>.vercel.app          (one site: pages and /api/*)
    ▼
 Vercel ── Next.js pages
    │  rewrites /api/*  →  https://<api>.onrender.com/*
    ▼
 Render ── NestJS API (Docker image), MockPay mounted inside it
    │                              │
    │  DATABASE_URL (TLS)          │  MOCKPAY_DATABASE_URL (TLS)
    ▼                              ▼
 Neon ──── database `vinyl`        database `mockpay`
           (orders, payments…)     (MockPay's sessions only)
```

The browser only ever talks to Vercel for the app itself. One exception:
MockPay's checkout page is served by the API, so **Pay now** sends the browser
to the Render URL (`PUBLIC_API_URL`) and MockPay sends it back to Vercel
(`PUBLIC_WEB_URL`). That page needs no login, so the cookie never has to
reach Render's domain.

## 5. Platform choices

| Part     | Service            | Why this one                                                |
| -------- | ------------------ | ----------------------------------------------------------- |
| Web      | **Vercel** (Hobby) | Built by the Next.js team; free for non-commercial projects |
| API      | **Render** (Free)  | Runs a long-lived process from a Dockerfile, for free       |
| Database | **Neon** (Free)    | Managed Postgres with no expiry date; plain `DATABASE_URL`  |

**Why the API isn't on Vercel too.** Vercel runs server code as serverless
functions: started per request, frozen or discarded afterwards. The API needs
a process that stays up — the expiry sweep is a timer inside it, MockPay's
webhook retries are `setTimeout`s, and Nest builds its whole dependency graph
at boot. In a function, the sweep never fires, a retry is frozen with the
invocation that scheduled it, and every cold call pays for the boot. **Stateful work with background jobs needs a
long-running process; stateless request/response work suits serverless.**

**Why not the alternatives.** Railway and Fly.io no longer have a free plan
for new accounts. Cloud Run is free within its quota but needs a billing
account, and it scales to zero like a function, so the sweep has the same
problem. Render's own free Postgres expires after 30 days, hence Neon. A free
VM (Oracle Cloud) would avoid sleeping entirely, at the cost of running Linux,
TLS and backups by hand — more operations work than this project is for.

_Free plans change. Each limit quoted here is re-checked when the account is
created (§10)._

## 6. What breaks, and the decisions

### 6.1 The auth cookie: proxy `/api` through Vercel

On two sites (`*.vercel.app` and `*.onrender.com`) the API's cookie is
third-party to the page. Making that work means `sameSite: 'none'`, which then
needs CSRF protection of its own, and Safari and Chrome block third-party
cookies more each year — the login would work in one browser and not another.

Instead, **Next.js rewrites `/api/*` to the API**. The browser calls
`https://<app>.vercel.app/api/products`; Vercel forwards it and passes the
answer back, `Set-Cookie` included. To the browser it is one site, so the
cookie is first-party, `sameSite: 'lax'` keeps working, and the auth code does
not change. `NEXT_PUBLIC_API_URL` becomes the `/api` path.

**As built.** `next.config.ts` rewrites `/api/:path*` to `${API_ORIGIN}/:path*`:
the prefix belongs to the web alone and is dropped on the way, so
`/api/products` reaches the API as `/products` and no API route changes.
`API_ORIGIN` has no `NEXT_PUBLIC_` prefix — only Next's server needs the
Render URL — and the config reads it **at build time**, so on Vercel it must be
set for the build. The web's client appends paths to `/api` rather than
resolving them with `new URL`, which drops a base's path and refuses a relative
one. Every API call already ran in the browser, so a relative base is enough;
nothing on the server would need the API's full address.

**Local development takes the same path**: `/api` is the default, and the dev
server forwards it to `localhost:3001`. The cookie then belongs to
`localhost:3000`, as it will belong to the Vercel URL, so the login is tested
the way it will run.

**Cost:** every API call takes one more hop, and Vercel's proxy has its own
timeout — which matters while the API is waking up (§6.3). ⚖️ If the timeout
turns out shorter than a cold start, the first request after a sleep fails
and the page's retry gets the answer.

### 6.2 The rate limit: trust the proxies' header

Behind Render's load balancer — and Vercel's proxy, with §6.1 — `req.ip` is a
proxy's address. Every customer shares one bucket: 100 requests a minute for
the whole site, and **the sixth login in a minute is refused for everyone.**

Express's `trust proxy` setting makes `req.ip` the client address from
`X-Forwarded-For` instead. It must trust only as many hops as there really
are: trusting the header blindly lets any caller pick their own IP and step
around the limit. The exact setting is confirmed against real request headers
on the deployed API, not guessed.

**How it is set.** `TRUST_PROXY` is a count of proxies, default `0` (none —
right locally, where nothing is in front). The schema refuses `true`: trusting
every hop takes the leftmost entry, which is the one the client writes. It also
makes sure the value reaches Express as a number, because a string such as
`"1"` is read as an address to trust, not a count.

**How it is measured.** `GET /admin/debug/request-ip` (admin only — it names
the host's proxies) answers with what the API saw: `remoteAddress` (the nearest
proxy), `forwardedFor` (the header as it arrived), `ips` (the trusted part) and
`ip` (what the rate limit counts by). Call it on the Render URL directly —
`curl` keeps the login cookie for that host — with a made-up first entry in
`X-Forwarded-For`, and raise `TRUST_PROXY` until `ip` is your own public
address. Render publishes no hop count, and one user reports three, so it is
measured, not copied.

**Two paths of different length.** Once §6.1 is in place, a request can arrive
two ways: through Vercel (most of the API) or straight at Render (MockPay's
checkout page, and anyone calling the Render URL). Express can be given only
one count:

| `TRUST_PROXY` set for | Through Vercel                    | Straight at Render                           |
| --------------------- | --------------------------------- | -------------------------------------------- |
| Render's hops + 1     | correct                           | reads the client's own entry: limit bypassed |
| Render's hops         | Vercel's address: customers share | correct                                      |

**Decision for now: Render's hops.** The worse case of that choice is
customers sharing a bucket; the worse case of the other is no limit at all.
How a request through Vercel carries the client's address in a way a direct
caller can't forge is decided with §6.1 (§11). An e2e test shows the failure:
two hops trusted, one appended, and the address the client wrote is taken.

### 6.3 Sleeping: accepted, with a wake-up ping

Render's free service sleeps after about 15 idle minutes, and the next request
waits for a cold start — up to about a minute. While asleep:

- **The expiry sweep does not run.** Correctness doesn't depend on it: paying
  checks `expiresAt` itself (payments.md §4.2, "the deadline is the
  deadline"). An expired order just keeps its stock until the API wakes and
  the next sweep releases it.
- **The first visitor waits.** For a portfolio link, that is the visitor who
  matters most.

A free external scheduler (such as cron-job.org) calling `/health` every
10 minutes keeps the service awake. The free plan's 750 hours a month cover
one service running all month, so this costs nothing — and the sweep runs on
time again.

### 6.4 MockPay in production: an explicit demo switch

Production refuses MockPay so that a misconfigured deploy can never take
"payments" that aren't real. That stays the default. A new variable (working
name `PAYMENT_DEMO=true`) allows it, and the site says plainly that no money
is taken.

The secure default is the point: forgetting the variable leaves payments
**off**, not a fake provider **on**.

### 6.5 Restarts forget MockPay's sessions: give MockPay its own database

Every sleep is a restart, and a restart empties MockPay's memory. Then:

- **An order with a `pending` payment can't be cancelled.** The void
  (payments.md §8.2) asks MockPay about a session it no longer has, gets
  `404`, reports `502`, and the cancel changes nothing — on every retry,
  forever.
- **The checkout page is gone.** A customer who opened it before the restart
  and presses **Pay** after it gets a `404`.

The loss comes from **where the data lives**, not where the code runs. Moving
MockPay into its own service on another free instance would not help: that
instance sleeps too — more often, with less traffic — and wakes up empty.

**Decision: MockPay stores its sessions in a database of its own**, `mockpay`,
next to ours (`vinyl`) on the same Postgres server, reached through its own
`MOCKPAY_DATABASE_URL`. A restart then forgets nothing: cancelling, paying and
the checkout page all work after a sleep.

Three ways to persist them were weighed:

| Where the sessions live          | Isolation                                     | Cost                        |
| -------------------------------- | --------------------------------------------- | --------------------------- |
| a table in our database          | by convention only — any of our code can read | none                        |
| a separate schema (`mockpay.*`)  | a namespace, but the same connection reads it | little                      |
| **a separate database** (chosen) | a different connection: our code **can't**    | a second Prisma client (§8) |

A separate database is what a real provider looks like — its data is out of
our reach, and the only way to learn whether something was paid is to ask it
over HTTP. With a shared table, a shortcut that reads MockPay's rows instead of
calling `expireSession` would pass every test and break the day a real
provider replaced it; with a separate connection it can't be written. It also
keeps payments.md §5.1 true as written: MockPay "never imports our services or
touches our database".

**It is also the first half of extracting MockPay as a service.** The code
boundary already exists — MockPay is a package of its own (`apps/mockpay`) that
the API only mounts, and `MockPayProvider` calls it over HTTP even
in-process, so `MOCKPAY_URL` can point anywhere. With the data separated too,
moving MockPay out later is relocation, not untangling (§11). This is the
**database-per-service** rule: a service owns its data, and others reach it
only through its API.

**What a database of its own costs:** a second Prisma schema, generated
client and migration history; migrations run against both databases on every
deploy (§9); and the e2e tests reset a second test database.

**What moving to a database changed: the order of a Pay and a void.** In
memory, MockPay's checks and its write ran in one synchronous step, so a Pay
press and a void could not interleave. Against a database there is an `await`
between a read and a write, and a void landing in it would leave the customer
told "paid" while we were told "not paid" — and cancelled the order. So each
move off `open` is a single conditional UPDATE (`… WHERE outcome = 'open'`):
the database's row lock lets exactly one through, and the other reads what
won. An e2e test fires both at once, twenty times over, and requires the two
answers to agree; with a read-then-write in its place, it fails.

**Still lost on restart: webhook retries.** They are `setTimeout`s. A restart
within the second between **Pay** and its webhook drops that webhook. Sleeping
can't cause it — it needs 15 idle minutes, and a payment is traffic — only a
deploy at that moment can. Even then the payment is recoverable: the session
is stored as paid, so a later cancel's void reads it and settles the order
(payments.md §8.2).

### 6.6 Uploaded images: later

Render's disk is wiped on every deploy. Until uploads go to object storage
(Cloudinary or Supabase Storage, both free), production turns uploads off with
a message. Discogs imports — where nearly every image comes from — are
unaffected.

## 7. Configuration

Secrets live in each platform's environment settings, never in the image or
the repository.

| Variable                 | Where  | Value                                     |
| ------------------------ | ------ | ----------------------------------------- |
| `NODE_ENV`               | Render | `production`                              |
| `PORT`                   | Render | set by Render; the API already reads it   |
| `DATABASE_URL`           | Render | Neon's `vinyl` database, with TLS         |
| `MOCKPAY_DATABASE_URL`   | Render | Neon's `mockpay` database, with TLS       |
| `JWT_SECRET`             | Render | new random value, not the local one       |
| `WEB_ORIGIN`             | Render | the Vercel URL                            |
| `PUBLIC_WEB_URL`         | Render | the Vercel URL (MockPay's return address) |
| `PUBLIC_API_URL`         | Render | the Render URL (MockPay's checkout page)  |
| `DISCOGS_TOKEN`          | Render | the Discogs token                         |
| `MOCKPAY_WEBHOOK_SECRET` | Render | new random value                          |
| `PAYMENT_DEMO`           | Render | `true` (§6.4)                             |
| `TRUST_PROXY`            | Render | Render's hop count, measured (§6.2)       |
| `NEXT_PUBLIC_API_URL`    | Vercel | unset: `/api` is the default (§6.1)       |
| `API_ORIGIN`             | Vercel | the Render URL, set for the build (§6.1)  |

## 8. The API image

A multi-stage Dockerfile at `apps/api/Dockerfile`, built from the repository
root so it can see the workspace (`pnpm-workspace.yaml`, the lockfile,
`packages/shared`, `apps/mockpay`):

1. **Build stage:** install the whole workspace from the lockfile, generate
   both Prisma clients (ours and MockPay's), and build the API with the
   workspace packages it loads at runtime from their `dist` — `shared` and
   `mockpay` — using `pnpm --filter "api..." build`, the dependencies first.
2. **`pnpm deploy`:** copy out just the API with its production dependencies
   — not the web app, not dev tools.
3. **Runtime stage:** `dist`, the production `node_modules`, and both Prisma
   schemas with their migrations. Runs as a non-root user, started with `node dist/main.js`
   directly so the process receives the platform's stop signal (a package
   manager in between may not pass it on).

Things this monorepo makes worth checking: `bcrypt` is a native module and must
be compiled inside the Linux image, never copied from a Mac; Prisma's client
is generated at install time, so the schema has to be in the image before
`pnpm install`.

**Verified locally first.** A Compose profile runs the image against the local
Postgres with production settings, so problems show up on the laptop rather
than in Render's build logs.

## 9. Deploying and migrating

**Schema changes are a step of their own, not part of starting the API.**
Running `prisma migrate deploy` at boot means a failed migration crash-loops
the service, and with more than one instance, several would try at once.

Each database has its own migration history, and both are migrated on every
deploy — `vinyl` with our schema, `mockpay` with MockPay's. Each package runs
its own, from its own `prisma.config.ts`, and each reads a different variable,
so neither can be pointed at the other's database by accident:

```bash
pnpm --filter api exec prisma migrate deploy                    # DATABASE_URL
pnpm --filter @vinyl-order/mockpay exec prisma migrate deploy   # MOCKPAY_DATABASE_URL
```

The e2e suite does the same against `vinyl_test` and `mockpay_test`: its
global setup checks both names end in `_test`, then resets both.

- **First deploy:** migrations run from the laptop against Neon by hand.
- **Later:** a GitHub Actions workflow on `main` runs `prisma migrate deploy`
  against both databases and, only if both succeed, triggers Render's deploy
  hook (with Render's auto-deploy off). The database is always at least as new as the
  code. ⚖️ Render's own pre-deploy command may need a paid plan; to confirm.

Migrations must stay **backward compatible for one release** — add a column
before the code that writes it, stop using one before dropping it — because
for a moment the new schema runs under the old code.

## 10. Implementation order

Each code step is its own PR.

0. This document.
1. MockPay demo switch (§6.4).
2. MockPay's own database (§6.5), in two PRs:
   - a. the plumbing, with no behaviour change: the `mockpay` database locally
     and in tests, MockPay's Prisma schema, client and first migration,
     `MOCKPAY_DATABASE_URL`, and CI;
   - b. MockPay's sessions move from memory into it, with a test that a
     session survives a restart.
3. `trust proxy`, so the rate limit sees the customer (§6.2).
4. The web calls the API through `/api` (§6.1).
5. Dockerfile, `.dockerignore`, and the local Compose profile (§8).
6. Neon: create both databases, run both migrations, import the catalog from
   Discogs, create the admin account.
7. Render: deploy the image, set §7's variables, health check on `/health`.
8. Vercel: deploy `apps/web`, point the rewrite at Render.
9. Smoke test the whole customer flow on the live site, including a cancel
   after a restart; add the wake-up ping.
10. The deploy workflow (§9).
11. Object storage for uploads (§6.6).
12. This document, updated with what deploying actually took.

Code first, then accounts: the code fixes are needed whatever the host, and
the image is proved locally before any platform sees it. 2a comes before 2b
so that the tooling — a second client, a second migration history, a second
test database — is reviewed on its own, before any behaviour depends on it.

## 11. Open questions

1. ⚖️ Is Vercel's proxy timeout longer than Render's cold start (§6.1)? If not,
   is a failed first request acceptable, or does the web retry it?
2. ⚖️ Does Neon's free plan allow a second database in the same project
   (§6.5)? If not, `mockpay` goes in a second free project — the code doesn't
   change, only `MOCKPAY_DATABASE_URL`.
3. When is MockPay worth extracting as its own service? Its code and data are
   both separable after step 2, so the move is cheap; on free plans it isn't
   worth it — two cold starts in a row can outlast `createSession`'s 5-second
   timeout, and one free plan's hours cover only one always-on service.
4. ⚖️ Can migrations run as a Render pre-deploy step on the free plan, or do
   they need the GitHub Actions workflow (§9)?
5. Should the in-memory rate limit move to Redis now, or when a second
   instance exists?
6. ⚖️ How does a request through Vercel tell the API its client's address
   (§6.2)? Does Vercel's rewrite forward `X-Forwarded-For` to an external
   origin at all? If so, the API still can't tell a Vercel request from a
   direct one that claims to be — one way is a header only Vercel's side can
   set, such as a secret the Next app adds, with the API taking the client
   address from it only when the secret matches.

## 12. Interview talking points

- **"Why not deploy the whole thing as serverless?"** → the API has a timer,
  in-memory state and retries that outlive a request; those need a process
  that stays up. Serverless suits stateless request/response (§5).
- **"Your rate limit works locally — why might it fail in production?"** →
  behind a proxy every request comes from the proxy's IP. Trust
  `X-Forwarded-For`, but only for the hops you really have (§6.2).
- **"Front end and API on different domains — how does the cookie work?"** →
  avoid the cross-site cookie altogether: proxy the API under the front end's
  own origin, so it stays first-party (§6.1).
- **"When do migrations run?"** → before the code that needs them, as their
  own step, and backward compatible for one release (§9).
- **"Would splitting it into a microservice fix lost state?"** → no: state is
  lost because of where it's stored, not where the code runs. Persist it
  first; give the service its own database so nothing else can reach its
  data; then extracting the code is a move, not a rewrite (§6.5).
- **"What's lost when a container restarts?"** → memory and local disk. Keep
  state in the database or object storage, or accept and record the loss
  (§6.3–6.6).
