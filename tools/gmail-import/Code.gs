/**
 * Sends the shops' order confirmations, and their payment and shipping
 * notices, from your Gmail to vinyl-order, once a day: the orders appear in
 * your supplier orders, and move on as the shops report, without typing.
 * See README.md, and docs/design/tracker.md §9.4–9.5 for why it works this
 * way.
 *
 * It runs in your Google account, as you. It searches for those emails from
 * three shops, and sends each one's sender, subject, date and HTML body —
 * with every link removed — to the import URL with your import token. It
 * reads nothing else, and changes nothing but two labels.
 *
 * Script properties (Project Settings → Script properties):
 * - IMPORT_TOKEN: your import token, from the Email import page
 * - IMPORT_URL:   the import URL shown on that page
 */

/**
 * Whose emails are sent, and the domain their signature must come from.
 * Must match the API's list (apps/api/src/supplier-orders/import/
 * senders.ts); anything else would only be refused there.
 */
var SENDERS = [
  { address: 'notifications+thtrecords@mail.easystore.co', domain: 'mail.easystore.co' },
  { address: 'notifications+universalvinylmusic@mail.easystore.co', domain: 'mail.easystore.co' },
  { address: 'store+100236001461@t.shopifyemail.com', domain: 't.shopifyemail.com' },
];

/** In every shop's confirmation subject ("您的訂單已確認。", "訂單 #3003 已確認"). */
var CONFIRMATION = '已確認';

/**
 * In the subjects of the notices the site reads: THT's payment and shipping,
 * Rotten Blues' shipping ("訂單 #3003 的貨件配送中"). The site decides what
 * each one means; this list only decides what is sent.
 */
var NOTICES = ['確認收款通知', '更新訂單出貨通知', '貨件配送中'];

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

/**
 * The hours, Taipei time, an hourly run sends in: from 10:00 until 22:00, the
 * last run inside the 21:00 hour. The site sleeps on its free plan and its
 * database bills by the hour awake, so nights are left alone; an email that
 * comes at night goes the next morning.
 */
var FIRST_HOUR = 10;
var END_HOUR = 22;

/** Script properties the runs keep for themselves, not set by hand. */
var LAST_RUN = 'LAST_RUN';
var LAST_FULL_DAY = 'LAST_FULL_DAY';

/** The trigger handlers this script has had: the daily one, then the hourly. */
var HANDLERS = ['importOrders', 'hourlyImport'];

/** Run once by hand: creates the labels and the hourly trigger, then imports. */
function install() {
  removeTriggers_();
  ScriptApp.newTrigger('hourlyImport').timeBased().everyHours(1).create();
  label_(LABEL_IMPORTED);
  label_(LABEL_FAILED);
  importOrders();
}

/** Run by hand to stop the import. */
function uninstall() {
  removeTriggers_();
}

/** Any trigger of this script's, the old daily one included. */
function removeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (HANDLERS.indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
  });
}

/**
 * Run by hand: sends the whole week now, whatever the hour — running it
 * means wanting it synced.
 */
function importOrders() {
  run_(true);
}

/**
 * The hourly trigger, inside FIRST_HOUR–END_HOUR. The day's first run sends
 * the whole week, as the daily run did, so a notice that came before its
 * order is sent again; later runs send only when an email has come since
 * the last run, so most end at the search without waking the site.
 */
function hourlyImport() {
  var hour = Number(Utilities.formatDate(new Date(), 'Asia/Taipei', 'H'));
  if (hour < FIRST_HOUR || hour >= END_HOUR) return;
  var today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  var fullRunDone = PropertiesService.getScriptProperties().getProperty(LAST_FULL_DAY) === today;
  run_(!fullRunDone);
}

/**
 * Search, and send what was found.
 *
 * @param full - send the whole week; otherwise only if an email came since
 *   the last run that reached the site
 */
function run_(full) {
  var startedAt = new Date();
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('IMPORT_TOKEN');
  var url = props.getProperty('IMPORT_URL');
  if (!token || !url) throw new Error('Set IMPORT_TOKEN and IMPORT_URL in Script properties.');

  var query =
    'from:(' +
    SENDERS.map(function (s) {
      return s.address;
    }).join(' OR ') +
    ') subject:(' +
    [CONFIRMATION].concat(NOTICES).join(' OR ') +
    ') newer_than:' +
    WINDOW;
  var threads = GmailApp.search(query);

  // Confirmations first: a notice applies only to an order already recorded,
  // so one sent before its order's confirmation would wait a day for nothing.
  var confirmations = [];
  var notices = [];
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      var kind = kindOf_(message.getSubject());
      if (kind === 'confirmation') confirmations.push({ thread: thread, message: message });
      if (kind === 'notice') notices.push({ thread: thread, message: message });
    });
  });
  var found = confirmations.concat(notices);

  var lastRun = Number(props.getProperty(LAST_RUN) || 0);
  var anyNew = found.some(function (item) {
    return item.message.getDate().getTime() > lastRun;
  });
  if (found.length === 0 || (!full && !anyNew)) return;

  wake_(url);

  var counts = {
    created: 0,
    already: 0,
    updated: 0,
    unchanged: 0,
    notYet: 0,
    failed: 0,
    ignored: 0,
    skipped: 0,
  };
  found.forEach(function (item) {
    var outcome = send_(item.message, url, token);
    if (outcome === 'unauthorized') {
      throw new Error('The import token was refused. Create a new one and update IMPORT_TOKEN.');
    }
    counts[outcome] += 1;
    if (IMPORTED_OUTCOMES.indexOf(outcome) !== -1) item.thread.addLabel(label_(LABEL_IMPORTED));
    if (outcome === 'failed') item.thread.addLabel(label_(LABEL_FAILED));
    // notYet: no label — the order isn't recorded yet, and tomorrow's run
    // sends the notice again, within the week.
  });
  // Counts only: the emails themselves are never logged.
  Logger.log(JSON.stringify(counts));

  // Only a run that reached the site for every email moves the mark: if the
  // site was down for any, the next run sees them as new and tries again.
  if (counts.skipped === 0) {
    props.setProperty(LAST_RUN, String(startedAt.getTime()));
    if (full) {
      props.setProperty(LAST_FULL_DAY, Utilities.formatDate(startedAt, 'Asia/Taipei', 'yyyy-MM-dd'));
    }
  }
}

/** What the site did with an email, for which it is labelled imported. */
var IMPORTED_OUTCOMES = ['created', 'already', 'updated', 'unchanged'];

/** The site's 200 answers, by the outcome they are counted as. */
var OUTCOME_OF_RESULT = {
  already_recorded: 'already',
  updated: 'updated',
  unchanged: 'unchanged',
  not_yet: 'notYet',
};

/** 'confirmation', 'notice', or null for a subject that isn't sent. */
function kindOf_(subject) {
  if (subject.indexOf(CONFIRMATION) !== -1) return 'confirmation';
  for (var i = 0; i < NOTICES.length; i++) {
    if (subject.indexOf(NOTICES[i]) !== -1) return 'notice';
  }
  return null;
}

/**
 * Send one message, if it is a signed confirmation or notice from a known
 * sender. Returns 'created', 'already', 'updated', 'unchanged', 'notYet'
 * (a notice for an order not recorded yet — sent again tomorrow), 'failed'
 * (the site couldn't read it), 'ignored' (not ours, or unsigned — never
 * sent), 'skipped' (the site was unreachable — tried again next run) or
 * 'unauthorized'.
 */
function send_(message, url, token) {
  var from = message.getFrom();
  var sender = senderOf_(from);
  if (!sender || !kindOf_(message.getSubject())) return 'ignored';
  if (!signedBy_(message, sender.domain)) return 'ignored';

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
  if (status === 200) return outcomeOf_(response);
  if (status === 422) return 'failed';
  if (status === 401) return 'unauthorized';
  Logger.log('Import answered ' + status + '; trying again tomorrow.');
  return 'skipped';
}

/**
 * A 200's outcome, from its `{ result }`. An answer it doesn't know is
 * skipped, so it is sent again tomorrow rather than labelled done.
 */
function outcomeOf_(response) {
  var result;
  try {
    result = JSON.parse(response.getContentText()).result;
  } catch (e) {
    result = null;
  }
  var outcome = OUTCOME_OF_RESULT[result];
  if (outcome) return outcome;
  Logger.log('Import answered 200 with an unknown result; trying again tomorrow.');
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
