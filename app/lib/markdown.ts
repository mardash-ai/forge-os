// A small, XSS-SAFE markdown renderer. Pure (no I/O, no React) so it is unit-testable in Node;
// the <Markdown> component (app/app/components/Markdown.tsx) maps this AST to real React nodes.
//
// Safety is by CONSTRUCTION — like lib/forge-search's parseSnippet, we never emit HTML strings
// and never touch dangerouslySetInnerHTML. Every run of user text becomes a React text node, and
// link hrefs are validated against a scheme allowlist (http/https/mailto/#/relative), so a
// `javascript:`/`data:` URL in a note body can never become an active link. This deliberately
// supports a useful SUBSET of markdown (headings, lists, quotes, fenced code, and inline
// bold/italic/code/links) rather than full CommonMark.

/** An inline span within a block. */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; children: Inline[] }
  | { t: 'em'; children: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; children: Inline[] };

/** A block-level element. */
export type Block =
  | { t: 'heading'; level: number; children: Inline[] }
  | { t: 'paragraph'; children: Inline[] }
  | { t: 'list'; ordered: boolean; items: Inline[][] }
  | { t: 'quote'; children: Inline[] }
  | { t: 'code'; text: string };

/** Reduce a link target to a safe href, or null to render it as plain text. Allows absolute
 *  http(s), mailto, in-page (#…), and app-relative (/… but not protocol-relative //…) URLs;
 *  rejects everything else (javascript:, data:, vbscript:, …). */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (h === '') return null;
  if (/^https?:\/\//i.test(h)) return h;
  if (/^mailto:/i.test(h)) return h;
  if (h.startsWith('#')) return h;
  if (h.startsWith('/') && !h.startsWith('//') && !h.startsWith('/\\')) return h;
  return null;
}

/** Parse a single line of inline markdown into spans. Recursive-descent over the delimiters,
 *  in precedence order: inline code (literal inside) → link → strong (`**`) → em (`*`/`_`). An
 *  unmatched delimiter is just text, so malformed input never throws or loses characters. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) {
      out.push({ t: 'text', v: buf });
      buf = '';
    }
  };

  while (i < text.length) {
    const c = text[i];

    // inline code — content is literal (no nested formatting)
    if (c === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ t: 'code', v: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // link [label](href)
    if (c === '[') {
      const close = text.indexOf(']', i + 1);
      if (close > i && text[close + 1] === '(') {
        const paren = text.indexOf(')', close + 2);
        if (paren > close) {
          const href = safeHref(text.slice(close + 2, paren));
          if (href) {
            flush();
            out.push({ t: 'link', href, children: parseInline(text.slice(i + 1, close)) });
            i = paren + 1;
            continue;
          }
        }
      }
    }

    // strong **…**
    if (c === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i + 1) {
        flush();
        out.push({ t: 'strong', children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // em *…* or _…_
    if (c === '*' || c === '_') {
      const end = text.indexOf(c, i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: 'em', children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    buf += c;
    i += 1;
  }
  flush();
  return out;
}

const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const UL_RE = /^\s{0,3}[-*]\s+(.*)$/;
const OL_RE = /^\s{0,3}\d+\.\s+(.*)$/;
const FENCE_RE = /^\s{0,3}```/;

/** Parse a markdown source into a block AST. Line-based: fenced code, ATX headings, blockquotes,
 *  unordered/ordered lists, and paragraphs (blank lines separate blocks). Intentionally flat —
 *  no nested lists — which keeps it small and predictable for note bodies. */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank — block separator
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // fenced code ```…```
    if (FENCE_RE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume the closing fence
      blocks.push({ t: 'code', text: body.join('\n') });
      continue;
    }

    // heading
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ t: 'heading', level: heading[1].length, children: parseInline(heading[2].trim()) });
      i += 1;
      continue;
    }

    // blockquote (consecutive `>` lines → one quote)
    if (QUOTE_RE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoted.push(QUOTE_RE.exec(lines[i])![1]);
        i += 1;
      }
      blocks.push({ t: 'quote', children: parseInline(quoted.join(' ').trim()) });
      continue;
    }

    // list (consecutive same-kind items → one list)
    if (UL_RE.test(line) || OL_RE.test(line)) {
      const ordered = OL_RE.test(line);
      const re = ordered ? OL_RE : UL_RE;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(parseInline(re.exec(lines[i])![1].trim()));
        i += 1;
      }
      blocks.push({ t: 'list', ordered, items });
      continue;
    }

    // paragraph — gather consecutive plain lines (soft breaks join with a space)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !FENCE_RE.test(lines[i]) &&
      !HEADING_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ t: 'paragraph', children: parseInline(para.join(' ')) });
  }

  return blocks;
}
