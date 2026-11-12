import { HTMLElement, type Node, TextNode, parse } from 'node-html-parser';

/**
 * Elements that start a new line of text. Table cells count: shop emails lay
 * out an order as a table, and a cell's text must not run into the next's
 * ("TWD 880" beside "金額:").
 */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'blockquote',
  'br',
  'dd',
  'div',
  'dl',
  'dt',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'ol',
  'p',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

/** Elements whose content is never text a reader sees. */
const HIDDEN_TAGS = ['head', 'script', 'style', 'title'];

/** A line break, for the walk below; collapsed with its neighbours afterwards. */
const BREAK = '\n';

const collect = (node: Node, out: string[]): void => {
  if (node instanceof TextNode) {
    // `text` is the decoded text ("&amp;" → "&"), not the markup.
    out.push(node.text);
    return;
  }
  if (!(node instanceof HTMLElement)) return; // comments
  const isBlock = BLOCK_TAGS.has(node.localName);
  if (isBlock) out.push(BREAK);
  for (const child of node.childNodes) collect(child, out);
  if (isBlock) out.push(BREAK);
};

/**
 * The text of an email's HTML, as the lines a reader would see: one per
 * block or table cell, whitespace collapsed (non-breaking spaces included),
 * empty lines dropped.
 *
 * Parsers read these lines rather than the markup, so a shop restyling its
 * template — new classes, an extra wrapper — doesn't break them; only a
 * change in what the email says does.
 *
 * Every email is read as HTML, whatever its MIME part claimed: Cosmic's
 * `text/plain` part is HTML too.
 *
 * @param html - the email body, as the Apps Script sends it
 */
export const emailLines = (html: string): string[] => {
  // The parser keeps a doctype as text, which would read as a first line.
  const root = parse(html.replace(/<!doctype[^>]*>/i, ''));
  for (const tag of HIDDEN_TAGS) {
    for (const element of root.querySelectorAll(tag)) element.remove();
  }

  // From the root's children: the root is the parser's container, with no
  // tag of its own to ask for.
  const pieces: string[] = [];
  for (const child of root.childNodes) collect(child, pieces);

  return pieces
    .join('')
    .split(BREAK)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
};
