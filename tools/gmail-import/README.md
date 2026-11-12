# Gmail import

A Google Apps Script that sends the shops' order confirmations from your Gmail
to vinyl-order once a day, so the orders appear in **Supplier orders** without
typing them in. Design and security notes: `docs/design/tracker.md` §9.4.

It reads confirmations from **THT**, **Cosmic** and **Rotten Blues**.
Candlelight sends none of its own (its mail comes from PayNow and names no
order), so its orders are still recorded by hand.

## Before you start: what it can do

To search your mail and add labels, Google asks you to allow access to your
**whole mailbox** (`https://mail.google.com/`) — Gmail has no narrower
permission for "only these senders". The script runs in your account, as you;
vinyl-order itself never gets that access.

So **read `Code.gs` before you paste it.** It:

- searches only for confirmations (`subject:已確認`) from three senders, from
  the last 7 days;
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

`install` creates the two labels and a trigger that runs `importOrders` every
day around 10:00 (Taipei), then runs it once.

## Afterwards

- **Is it running?** The Email import page shows "Last import …". The
  project's **Executions** page shows each run and its counts.
- **`vinyl-import-failed`**: the site couldn't read that email (a template it
  doesn't know, or lines that don't add up to the subtotal). Record that order
  by hand; if it keeps happening for a shop, the parser needs that email as a
  new fixture.
- **Orders already typed in** are left as they are: the order number decides,
  so an email for an order you've recorded changes nothing.
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
