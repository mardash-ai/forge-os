// Pure-domain tests for lib/documents — the attachment allowlist/limits, image detection, byte
// formatting, and the list excerpt. No I/O, so these run in the hermetic offline suite.

import { describe, it, expect } from 'vitest';
import {
  MAX_ATTACHMENT_BYTES,
  attachmentRejectionMessage,
  formatBytes,
  isAllowedContentType,
  isImageContentType,
  normalizeContentType,
  plainExcerpt,
  validateAttachment,
} from '../lib/documents';

describe('normalizeContentType', () => {
  it('lowercases and strips the charset parameter', () => {
    expect(normalizeContentType('Text/Markdown; charset=utf-8')).toBe('text/markdown');
    expect(normalizeContentType('IMAGE/PNG')).toBe('image/png');
  });
  it('is empty for null/undefined/empty', () => {
    expect(normalizeContentType(null)).toBe('');
    expect(normalizeContentType(undefined)).toBe('');
    expect(normalizeContentType('')).toBe('');
  });
});

describe('isAllowedContentType — the C20 allowlist', () => {
  it('allows the four image types + three doc types', () => {
    for (const ct of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/markdown']) {
      expect(isAllowedContentType(ct)).toBe(true);
    }
  });
  it('rejects everything else (incl. dangerous types)', () => {
    for (const ct of ['image/svg+xml', 'text/html', 'application/zip', 'application/octet-stream', 'video/mp4', '']) {
      expect(isAllowedContentType(ct)).toBe(false);
    }
  });
});

describe('isImageContentType', () => {
  it('is true only for allowlisted image types', () => {
    expect(isImageContentType('image/png')).toBe(true);
    expect(isImageContentType('image/gif')).toBe(true);
    expect(isImageContentType('image/svg+xml')).toBe(false); // image/* but NOT allowed
    expect(isImageContentType('application/pdf')).toBe(false);
  });
});

describe('validateAttachment — size + type gate (mirrors the platform)', () => {
  it('accepts an allowed type within the size cap and returns the normalized type', () => {
    expect(validateAttachment({ contentType: 'image/png', size: 1024 })).toEqual({ ok: true, contentType: 'image/png' });
  });
  it('rejects an empty file', () => {
    expect(validateAttachment({ contentType: 'image/png', size: 0 })).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects a file over 15 MB', () => {
    expect(validateAttachment({ contentType: 'image/png', size: MAX_ATTACHMENT_BYTES + 1 })).toEqual({ ok: false, reason: 'size' });
  });
  it('accepts a file exactly at the cap', () => {
    expect(validateAttachment({ contentType: 'application/pdf', size: MAX_ATTACHMENT_BYTES }).ok).toBe(true);
  });
  it('rejects a disallowed type', () => {
    expect(validateAttachment({ contentType: 'text/html', size: 10 })).toEqual({ ok: false, reason: 'type' });
  });
  it('has a human message for each reason', () => {
    expect(attachmentRejectionMessage('empty')).toMatch(/empty/i);
    expect(attachmentRejectionMessage('size')).toMatch(/15 MB/);
    expect(attachmentRejectionMessage('type')).toMatch(/supported/i);
  });
});

describe('formatBytes', () => {
  it('scales through the units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(40)).toBe('40 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1.4 * 1024 * 1024)).toBe('1.4 MB');
  });
});

describe('plainExcerpt — strips markdown for the list card', () => {
  it('drops heading/list/link/emphasis markers and collapses whitespace', () => {
    const md = '# Title\n\nSome **bold** and _em_ and `code` and [a link](https://x.io).\n\n- one\n- two';
    const out = plainExcerpt(md);
    expect(out).not.toContain('#');
    expect(out).not.toContain('**');
    expect(out).not.toContain('](');
    expect(out).toContain('a link');
    expect(out).toContain('Title');
  });
  it('truncates with an ellipsis past the max', () => {
    const out = plainExcerpt('x'.repeat(300), 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith('…')).toBe(true);
  });
});
