// Pure domain logic for Areas — a user-defined life domain (Health, Career, Finance…)
// that Goals, Habits, and Projects can be tagged to (each to at most one Area). No I/O,
// so it is unit-testable in Node. The data-access layer (lib/db.ts) and API routes are
// thin wrappers over this. Mirrors lib/projects.ts in shape but Areas carry no rollup —
// they are a lightweight classifier, not a container.

export interface Area {
  id: string;
  name: string;
  color: string; // an optional accent, a #rrggbb hex or '' (none)
  createdAt: string;
}

/** An Area plus how many of the owner's resources are currently tagged to it — the shape
 *  the management surface renders. Counts are per resource kind, owner-scoped. */
export interface AreaWithCounts extends Area {
  goalCount: number;
  habitCount: number;
  projectCount: number;
}

/** The lighter shape a tagging picker / filter renders — no counts. */
export interface AreaOption {
  id: string;
  name: string;
  color: string;
}

/** The kinds of resource that can be tagged to an Area. */
export type TaggableKind = 'goal' | 'habit' | 'project';

/**
 * A small curated accent palette the UI offers as swatches. The server accepts ANY valid
 * `#rrggbb` (see normalizeColor), so this list is a convenience, not a constraint — it is
 * drawn from the "forge floor" tokens so accents sit in the same family as the rest of the UI.
 */
export const AREA_COLORS: readonly string[] = [
  '#cb5320', // forge orange (t2)
  '#e9a93c', // heat amber (t3)
  '#d0503a', // warn red
  '#3f8f5b', // green
  '#4b7fd0', // blue
  '#9b6dd0', // violet
  '#c65f8f', // magenta
  '#5aa6a0', // teal
];

/** Trims a name candidate; non-strings become ''. */
export function normalizeName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Validates an Area name: trims it, and rejects empty / whitespace-only input. */
export function validateName(raw: unknown): { ok: true; value: string } | { ok: false; value: '' } {
  const value = normalizeName(raw);
  return value.length === 0 ? { ok: false, value: '' } : { ok: true, value };
}

/**
 * Normalize an accent color: a `#rrggbb` hex (any case) is kept lower-cased; anything else
 * — including undefined, a bad format, or a named color — collapses to '' (no accent). So a
 * malformed color never persists and never needs escaping.
 */
export function normalizeColor(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const v = raw.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : '';
}

/** The intent of an `areaId` field in a resource's PATCH body — the shared shape the goal /
 *  habit / project tag routes branch on. `set` carries the id (the db layer still validates it
 *  is a uuid the caller owns); `clear` unties the resource; `absent` means this PATCH isn't a
 *  tag op; `invalid` is a malformed value (a 400). */
export type AreaIdField =
  | { kind: 'absent' }
  | { kind: 'set'; areaId: string }
  | { kind: 'clear' }
  | { kind: 'invalid' };

/** Interpret the `areaId` field on a PATCH body: a non-empty string tags, `null` clears, an
 *  absent key is not a tag op, anything else is malformed. */
export function parseAreaIdField(fields: Record<string, unknown>): AreaIdField {
  if (!('areaId' in fields)) return { kind: 'absent' };
  const v = fields.areaId;
  if (v === null) return { kind: 'clear' };
  if (typeof v === 'string' && v.length > 0) return { kind: 'set', areaId: v };
  return { kind: 'invalid' };
}
