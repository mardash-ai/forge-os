// Pure tests for the safe markdown parser (lib/markdown). No React, no I/O — it produces an AST
// the <Markdown> component maps to React nodes. The security-critical part is safeHref, which
// keeps note bodies from smuggling active links.

import { describe, it, expect } from 'vitest';
import { parseInline, parseMarkdown, safeHref, type Block } from '../lib/markdown';

describe('safeHref — scheme allowlist (XSS defense)', () => {
  it('allows http/https/mailto/#/relative', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('http://x.io/a')).toBe('http://x.io/a');
    expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeHref('#section')).toBe('#section');
    expect(safeHref('/notes/1')).toBe('/notes/1');
  });
  it('rejects javascript:, data:, vbscript:, and protocol-relative //', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JAVASCRIPT:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>')).toBeNull();
    expect(safeHref('vbscript:msgbox')).toBeNull();
    expect(safeHref('//evil.com')).toBeNull();
    expect(safeHref('')).toBeNull();
  });
});

describe('parseInline', () => {
  it('parses bold, italic, and inline code', () => {
    expect(parseInline('a **b** c')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'strong', children: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' c' },
    ]);
    expect(parseInline('_em_')).toEqual([{ t: 'em', children: [{ t: 'text', v: 'em' }] }]);
    expect(parseInline('use `code` here')).toEqual([
      { t: 'text', v: 'use ' },
      { t: 'code', v: 'code' },
      { t: 'text', v: ' here' },
    ]);
  });
  it('parses a safe link and downgrades an unsafe one to text', () => {
    expect(parseInline('[x](https://a.io)')).toEqual([
      { t: 'link', href: 'https://a.io', children: [{ t: 'text', v: 'x' }] },
    ]);
    // javascript: link → the whole thing stays literal text (no link node)
    const unsafe = parseInline('[x](javascript:alert(1))');
    expect(unsafe.some((n) => n.t === 'link')).toBe(false);
  });
  it('does not format markers inside inline code', () => {
    expect(parseInline('`**not bold**`')).toEqual([{ t: 'code', v: '**not bold**' }]);
  });
  it('treats an unmatched delimiter as plain text', () => {
    expect(parseInline('a * b')).toEqual([{ t: 'text', v: 'a * b' }]);
  });
});

describe('parseMarkdown — block grammar', () => {
  it('parses headings with a level', () => {
    const blocks = parseMarkdown('## Hello');
    expect(blocks[0]).toMatchObject({ t: 'heading', level: 2 });
  });
  it('groups an unordered list', () => {
    const blocks = parseMarkdown('- one\n- two');
    expect(blocks).toHaveLength(1);
    const list = blocks[0] as Extract<Block, { t: 'list' }>;
    expect(list.t).toBe('list');
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
  });
  it('groups an ordered list', () => {
    const list = parseMarkdown('1. a\n2. b')[0] as Extract<Block, { t: 'list' }>;
    expect(list).toMatchObject({ t: 'list', ordered: true });
    expect(list.items).toHaveLength(2);
  });
  it('captures a fenced code block verbatim', () => {
    const blocks = parseMarkdown('```\nline1\nline2\n```');
    expect(blocks[0]).toEqual({ t: 'code', text: 'line1\nline2' });
  });
  it('captures a blockquote', () => {
    const blocks = parseMarkdown('> quoted');
    expect(blocks[0]).toMatchObject({ t: 'quote' });
  });
  it('separates paragraphs on blank lines and joins soft breaks', () => {
    const blocks = parseMarkdown('one\ntwo\n\nthree');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ t: 'paragraph', children: [{ t: 'text', v: 'one two' }] });
  });
  it('is robust on empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n')).toEqual([]);
  });
});
