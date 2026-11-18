# Gmail import

A Google Apps Script that sends the shops' order emails from your Gmail to
vinyl-order every hour in the daytime, so the orders appear in **Supplier
orders** without typing them in, and move on as the shops report. Design and security notes:
`docs/design/tracker.md` §9.4 (confirmations) and §9.5 (notices).

What it sends:

| Shop         | Confirmation (records the order) | Notices (move the order)                                                                                   |
| ------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| THT          | `您的訂單已確認。`               | `確認收款通知` → paid; `更新訂單出貨通知` → shipped                                                        |
| Cosmic       | `您的訂單已確認。`               | `確認收款通知` → paid                                                                                      |
| Rotten Blues | `訂單 #… 已確認`                 | `訂單 #… 的貨件配送中` → shipped; `訂單 #… 的貨件已送達` → ready for pickup; each with its tracking number |

Candlelight sends no confirmation of its own (its mail comes from PayNow and
names no order), so its orders are still recorded by hand. Every step not
listed is marked by hand, as the order's page says; `docs/design/tracker.md`
§9.5 says which emails are left unread, and why.

## Before you start: what it can do

To search your mail and add labels, Google asks you to allow access to your
**whole mailbox** (`https://mail.google.com/`) — Gmail has no narrower
permission for "only these senders". The script runs in your account, as you;
vinyl-order itself never gets that access.

So **read `Code.gs` before you paste it.** It:

- searches only for the subjects above from three senders, from the last 7
  days, and sends confirmations before notices;
- skips any whose DKIM signature Gmail didn't verify for that sender's domain;
- sends each one's sender, subject, date and HTML body to your import URL,
  **with every link removed** — one of them (Rotten Blues' "view your order")
  carries a key that shows your name and address to anyone holding it;
- adds the label `vinyl-imported` or `vinyl-import-failed`;
- logs counts only, never the emails.

It has no libraries. Copy it from this repository, not from anywhere else.

## Setup

1. On the site, open **Supplier orders → Email import** and create an import
   token. Copy it: it is shown only once.
2. Open [script.google.com](https://script.google.com) and create a new
   project.
3. Replace the contents of `Code.gs` with this folder's `Code.gs`.
4. **Project Settings** → tick **Show "appsscript.json" manifest file in
   editor**. Replace its contents with this folder's `appsscript.json`.
5. **Project Settings → Script properties**, add:
   - `IMPORT_TOKEN` — your token
   - `IMPORT_URL` — the import URL shown on the Email import page
6. In the editor, choose the function **`install`** and **Run**. Allow the
   access Google asks for (it will warn that the app isn't verified: it is
   your own script — **Advanced → Go to (project name)**).

`install` creates the two labels and an hourly trigger (`hourlyImport`), then
runs `importOrders` once.

## When it runs

- **Every hour from 10:00 to 22:00 (Taipei)**; the last run falls inside the
  21:00 hour. An email that comes during the day reaches the site within the
  hour; one that comes at night, the next morning.
- **The day's first run sends the whole week**, as a daily run would: that is
  what sends again a notice whose order wasn't recorded yet.
- **The other runs send only when an email has come since the last run.**
  Most find nothing new and stop at the search, without waking the site — on
  its free plan it sleeps, and its database is billed by the hours it is
  awake. If the site couldn't be reached for an email, the next run tries
  again.
- **Running `importOrders` by hand** sends the whole week now, whatever the
  hour.
- Nights are left alone for the same reason; to change the hours, edit
  `FIRST_HOUR` and `END_HOUR`.

## Afterwards

- **Is it running?** The Email import page shows "Last import …". The
  project's **Executions** page shows each run and its counts.
- **`vinyl-import-failed`**: the site couldn't read that email (a template it
  doesn't know, or lines that don't add up to the subtotal). Record that order
  by hand; if it keeps happening for a shop, the parser needs that email as a
  new fixture.
- **Orders already typed in** are left as they are: the order number decides,
  so a confirmation for an order you've recorded changes nothing.
- **Notices only move an order forward, and only fill what is empty.** A
  payment day or tracking number you typed is kept, and an order you marked
  further along, or cancelled, isn't moved back.
- **A notice for an order the site doesn't have yet** gets no label and is
  sent again the next morning, within the week — so once its confirmation is
  imported, or you type the order in, the notice applies.
- **Reading the counts** (the log of a run that sent anything):
  `created` and `already` are confirmations; `updated`, `unchanged` and
  `notYet` are notices; `failed` went to `vinyl-import-failed`; `ignored`
  wasn't sent (unsigned, or not a shop's); `skipped` couldn't reach the site
  and is tried again. A Cosmic shipping notice lands in `failed` until the
  site reads it — keep one, it's the sample that teaches the site.
- **Updating the script:** paste this folder's `Code.gs` over the old one and
  save. The properties stay. Run **`install`** once if the update changes
  when it runs (the move from daily to hourly did); otherwise the trigger
  stays as it is.
- **New token?** Replacing or revoking it on the site stops the script at once
  (its runs fail with "The import token was refused"). Paste the new one into
  `IMPORT_TOKEN`.
- **Stop it:** run **`uninstall`**, or delete the project.

## Why 7 days and not "everything not yet labelled"

The shops reuse one subject, so Gmail threads their confirmations together,
and Gmail labels whole threads — a "done" label would hide a new
confirmation that lands in an old thread. Instead each run looks at the last
week and sends everything; the site ignores orders it already has. A week
also rides out a few days of the site being down. Older confirmations are
never sent, so setting it up doesn't fill your list with orders delivered long
ago.
