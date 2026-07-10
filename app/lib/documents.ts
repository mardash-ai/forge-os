// Pure domain logic for Notes / Documents (feature B1) and their file attachments — the first
// consumer of the platform blob store (capability C20). No I/O, so it is unit-testable in Node.
// The data-access layer (lib/db.ts), the API routes, and the UI are thin wrappers over these
// types + guards; the markdown BODY is rendered through lib/markdown.ts (also pure + safe).

/** A note: a markdown document, optionally linked to a Goal and/or a Project. Owner-scoped in
 *  the db layer (every query filters WHERE owner_id = <session user>). */
export interface Document {
  id: string;
  title: string;
  bodyMd: string;
  /** The Goal this note is linked to, or null. Nullable FK `ON DELETE SET NULL`, so deleting
   *  the goal keeps the note (the link is just cleared). */
  goalId: string | null;
  /** The Project this note is linked to, or null (same `ON DELETE SET NULL` semantics). */
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A file attached to a note. The BYTES live in the platform blob store (C20); the app keeps
 *  only the returned `blobId` + metadata. Cascade-deleted with its note. */
export interface DocumentAttachment {
  id: string;
  documentId: string;
  blobId: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
}

/** A note plus the denormalized link titles + attachment count — the /notes list row. */
export interface DocumentSummary extends Document {
  attachmentCount: number;
  goalTitle: string | null;
  projectTitle: string | null;
}

/** A note with its attachments + link titles — the /notes/[id] detail shape. */
export interface DocumentWithAttachments extends Document {
  attachments: DocumentAttachment[];
  goalTitle: string | null;
  projectTitle: string | null;
}

// ---- attachment allowlist + limits (the C20 contract, enforced app-side too) --------------
// The platform sniffs magic bytes and enforces these as well; we mirror them so a bad file is
// rejected before it ever leaves the app (fast feedback + no wasted upload).

/** Hard per-file ceiling — 15 MB (the C20 contract). */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** Allowed content types: images (png/jpeg/webp/gif) + docs (pdf/plain/markdown). */
export const ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/** Lowercase a content type and drop any `; charset=…` parameter (browsers vary). */
export function normalizeContentType(ct: string | null | undefined): string {
  if (!ct) return '';
  return ct.split(';', 1)[0].trim().toLowerCase();
}

/** True if the (normalized) content type is on the allowlist. */
export function isAllowedContentType(ct: string | null | undefined): boolean {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(normalizeContentType(ct));
}

/** True for an allowlisted image type — these render inline; other allowed types download. */
export function isImageContentType(ct: string | null | undefined): boolean {
  const c = normalizeContentType(ct);
  return c.startsWith('image/') && isAllowedContentType(c);
}

export type AttachmentValidation =
  | { ok: true; contentType: string }
  | { ok: false; reason: 'empty' | 'size' | 'type' };

/** Validate a candidate attachment against the size + type allowlist (the app-side mirror of
 *  the platform's own checks). Returns the normalized content type on success. */
export function validateAttachment(input: { contentType: string | null | undefined; size: number }): AttachmentValidation {
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, reason: 'empty' };
  if (input.size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'size' };
  const contentType = normalizeContentType(input.contentType);
  if (!isAllowedContentType(contentType)) return { ok: false, reason: 'type' };
  return { ok: true, contentType };
}

/** A human message for a rejected attachment (shared by the route + the uploader UI). */
export function attachmentRejectionMessage(reason: 'empty' | 'size' | 'type'): string {
  switch (reason) {
    case 'empty':
      return 'That file is empty.';
    case 'size':
      return 'That file is over the 15 MB limit.';
    case 'type':
      return 'That file type isn’t supported (images: PNG/JPEG/WebP/GIF; docs: PDF/text/markdown).';
  }
}

/** Compact byte size for the attachment chip (e.g. "1.4 MB", "812 KB", "40 B"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** A short plain-text excerpt of a markdown body for the list card — strips the most common
 *  inline/leading markers and collapses whitespace. Not a full render (that's lib/markdown);
 *  just enough to preview. */
export function plainExcerpt(bodyMd: string, max = 160): string {
  const text = bodyMd
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → their text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // heading markers
    .replace(/^\s{0,3}>\s?/gm, '') // blockquote markers
    .replace(/^\s{0,3}(?:[-*]|\d+\.)\s+/gm, '') // list markers
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // bold/italic
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}
