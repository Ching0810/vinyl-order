import type { MockPaySession } from './mockpay.sessions';

/**
 * Escape text for HTML. Session fields come from whoever opened the session,
 * so an order id holding `<script>` must render as text, not run in the
 * customer's browser.
 */
const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** What the customer can still do with this session, as the page says it. */
const stateOf = (session: MockPaySession): string | null => {
  if (session.outcome === 'paid') return 'This payment has been made.';
  if (session.outcome === 'declined') return 'This payment was declined.';
  if (session.expiresAt <= new Date()) return 'This payment session has expired.';
  return null;
};

/**
 * MockPay's payment page: the amount, and a Pay and a Decline button.
 *
 * Plain forms, no script: each button POSTs, and MockPay answers with a 303 to
 * the merchant's return URL, which the browser follows on its own. A string
 * rather than a template engine — it is one development-only page.
 */
export const renderCheckoutPage = (session: MockPaySession): string => {
  const amount = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: session.currency,
  }).format(session.amountCents / 100);
  const id = escapeHtml(session.id);
  const state = stateOf(session);

  const actions = state
    ? `<p>${escapeHtml(state)}</p>`
    : `<form method="post" action="/mockpay/checkout/${id}/pay"><button type="submit">Pay</button></form>
      <form method="post" action="/mockpay/checkout/${id}/decline"><button type="submit">Decline</button></form>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MockPay</title>
  </head>
  <body>
    <h1>MockPay</h1>
    <p>A fake payment provider. No real money moves.</p>
    <p>Order ${escapeHtml(session.orderId)}</p>
    <p><strong>${escapeHtml(amount)}</strong></p>
    ${actions}
  </body>
</html>`;
};
