/**
 * Sends the shops' order confirmations from your Gmail to vinyl-order, once a
 * day, so the orders appear in your supplier orders without typing them in.
 * See README.md, and docs/design/tracker.md §9.4 for why it works this way.
 *
 * It runs in your Google account, as you. It searches for the confirmation
 * emails of three shops, and sends each one's sender, subject, date and HTML
 * body — with every link removed — to the import URL with your import token.
 * It reads nothing else, and changes nothing but two labels.
 *
 * Script properties (Project Settings → Script properties):
 * - IMPORT_TOKEN: your import token, from the Email import page
 * - IMPORT_URL:   the import URL shown on that page
 */

/**
 * Whose emails are sent, and the domain their signature must come from.
 * Must match the API's list (apps/api/src/supplier-orders/import/
 * parse-confirmation.ts); anything else would only be refused there.
 */
var SENDERS = [
  { address: 'notifications+thtrecords@mail.easystore.co', domain: 'mail.easystore.co' },
  { address: 'notifications+universalvinylmusic@mail.easystore.co', domain: 'mail.easystore.co' },
  { address: 'store+100236001461@t.shopifyemail.com', domain: 't.shopifyemail.com' },
];

/**
 * How far back each run looks. The API ignores an order it already has, so
 * re-sending is harmless, and a window rather than a "done" label means an
 * email in a thread that was labelled before is still seen (the shops reuse
 * one subject, so Gmail threads their confirmations together). A week rides
 * out a few days of the site being down; older emails stay where they are.
 */
var WINDOW = '7d';

var LABEL_IMPORTED = 'vinyl-imported';
var LABEL_FAILED = 'vinyl-import-failed';

/** Run once by hand: creates the labels and the daily trigger, then imports. */
function install() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'importOrders') ScriptApp.deleteTrigger(trigger);
  });
  // Mid-morning Taipei time, when the site is usually awake.
  ScriptApp.newTrigger('importOrders').timeBased().everyDays(1).atHour(10).create();
  label_(LABEL_IMPORTED);
  label_(LABEL_FAILED);
  importOrders();
}

/** Run by hand to stop the daily import. */
function uninstall() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'importOrders') ScriptApp.deleteTrigger(trigger);
  });
}

/** The daily run. */
function importOrders() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('IMPORT_TOKEN');
  var url = props.getProperty('IMPORT_URL');
  if (!token || !url) throw new Error('Set IMPORT_TOKEN and IMPORT_URL in Script properties.');

  var query =
    'from:(' +
    SENDERS.map(function (s) {
      return s.address;
    }).join(' OR ') +
    ') subject:已確認 newer_than:' +
    WINDOW;
  var threads = GmailApp.search(query);
  if (threads.length === 0) return;

  wake_(url);

  var counts = { created: 0, already: 0, failed: 0, skipped: 0 };
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      var outcome = send_(messages[m], url, token);
      if (outcome === 'unauthorized') {
        throw new Error('The import token was refused. Create a new one and update IMPORT_TOKEN.');
      }
      counts[outcome] += 1;
      if (outcome === 'created' || outcome === 'already') {
        threads[t].addLabel(label_(LABEL_IMPORTED));
      }
      if (outcome === 'failed') threads[t].addLabel(label_(LABEL_FAILED));
    }
  }
  // Counts only: the emails themselves are never logged.
  Logger.log(JSON.stringify(counts));
}

/**
 * Send one message, if it is a signed confirmation from a known sender.
 * Returns 'created', 'already', 'failed' (the site couldn't read it),
 * 'skipped' (not ours, unsigned, or the site was unreachable — tried again
 * tomorrow) or 'unauthorized'.
 */
function send_(message, url, token) {
  var from = message.getFrom();
  var sender = senderOf_(from);
  if (!sender || message.getSubject().indexOf('已確認') === -1) return 'skipped';
  if (!signedBy_(message, sender.domain)) return 'skipped';

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    payload: JSON.stringify({
      from: from,
      subject: message.getSubject(),
      date: message.getDate().toISOString(),
      html: withoutLinks_(message.getBody()),
    }),
    muteHttpExceptions: true,
  });

  var status = response.getResponseCode();
  if (status === 201) return 'created';
  if (status === 200) return 'already';
  if (status === 422) return 'failed';
  if (status === 401) return 'unauthorized';
  Logger.log('Import answered ' + status + '; trying again tomorrow.');
  return 'skipped';
}

/** The known sender in a From header, or null. */
function senderOf_(from) {
  var match = /<([^>]+)>/.exec(from);
  var address = (match ? match[1] : from).trim().toLowerCase();
  for (var i = 0; i < SENDERS.length; i++) {
    if (SENDERS[i].address === address) return SENDERS[i];
  }
  return null;
}

/**
 * Whether Gmail found a valid DKIM signature from the sender's domain. Only
 * the first Authentication-Results header is read: Gmail adds its own on top,
 * and any below it came with the message, so could be written by anyone.
 */
function signedBy_(message, domain) {
  var raw = message.getRawContent();
  var headers = raw.slice(0, raw.search(/\r?\n\r?\n/));
  var unfolded = headers.replace(/\r?\n[ \t]+/g, ' ');
  var first = /^Authentication-Results: mx\.google\.com;(.*)$/im.exec(unfolded);
  if (!first) return false;
  var re = /dkim=pass[^;]*?header\.[id]=@?([a-z0-9.-]+)/gi;
  var found;
  while ((found = re.exec(first[1]))) {
    var signer = found[1].toLowerCase();
    if (signer === domain || signer.slice(-(domain.length + 1)) === '.' + domain) return true;
  }
  return false;
}

/**
 * The HTML with every href removed. The site needs none of them, and one —
 * Shopify's order page link — carries a key that shows the order, with your
 * name and address, to anyone holding it.
 */
function withoutLinks_(html) {
  return html.replace(/\s+href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

/**
 * Wake the site before sending: on its free plan it sleeps, and a request to
 * a sleeping instance can be answered with an error page instead of waking
 * it. A few tries, a few seconds apart; if it stays down, the sends that
 * follow fail and are retried tomorrow.
 */
function wake_(importUrl) {
  var health = importUrl.replace(/\/supplier-orders\/import\/?$/, '/health');
  for (var i = 0; i < 6; i++) {
    var code = UrlFetchApp.fetch(health, {
      headers: { Accept: 'application/json' },
      muteHttpExceptions: true,
    }).getResponseCode();
    if (code === 200) return;
    Utilities.sleep(10000);
  }
}

/** The label, created if it doesn't exist. */
function label_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
