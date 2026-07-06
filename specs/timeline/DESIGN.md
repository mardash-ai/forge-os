# Timeline — Design Spec

The visual + interaction system for the Timeline (`/timeline`). It **extends the forge-os
design language** already established in `specs/goals-and-tasks/DESIGN.md` — same committed
dark world, same tokens, same type. Read that first; this spec only adds what's new.

---

## 1. Thesis

The Timeline is **the forge log** — the running record of what you've worked. Its one job:
let you read your recent *momentum* at a glance. The Forge Floor answers "what's hot right
now?"; the Log answers "what have I been forging?"

The design reuses the app's signature idea — **heat encodes meaning** — and applies it to
time: each event is a **spark** on a vertical rail, colored by its energy. A day of
completions glows warm down the rail; a day of just setting things up stays cool. You can
read the temperature of a day before reading a word.

## 2. Signature — the forge log rail

A single vertical **rail** runs down the left, and every event is a **spark** (a node) on it.
The spark's color comes from the same tempering ramp as the Heat Bar, mapped to the event's
*energy* — productive strikes glow, setup/quiet events stay cool:

| Event | Spark | Reads as |
|---|---|---|
| Goal **forged** (status → achieved) | white-hot `--t4` **+ bloom** | the peak moment |
| **Task completed** | straw `--t3`, soft glow | a productive strike |
| Goal **reopened** (→ active) | forge-orange `--t2` | back in the fire |
| **Goal created** | temper-blue `--t0` (cool, no glow) | a new billet |
| **Task added** | ash `--ash` dot (dim, no glow) | a stroke queued |
| Goal **archived** (→ archived) | cooled `#6f665c` (dimmest) | set aside |

- The rail is a 1px `--iron-edge` line; sparks sit on it at ~9px, glow (`box-shadow`) scaled
  to their heat — so warmth literally comes off the productive events.
- This is the memorable thing. Everything else stays quiet.

## 3. Reused tokens & type (unchanged)

Surfaces `--slag #16120E` / `--iron #2A231D` / `--iron-edge #3A312A`; text `--chalk #EFE7DA`
/ `--ash #A69C90`; ramp `--t0 #38506B` → `--t2 #CB5320` → `--t3 #E9A93C` → `--t4 #FBF1D6`;
accent/focus `#CB5320` / `#E9A93C`. Type: **Bricolage Grotesque** (display), **Instrument
Sans** (body), **IBM Plex Mono** (telemetry/timestamps). Dark, committed.

## 4. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ FORGE·OS                                   Floor    · [ Log ]  │  ← masthead + nav (Log active)
│                                                              │
│ THE FORGE LOG                                                │  ← eyebrow (mono)
│ What you've forged lately                                    │  ← Bricolage
│                                                              │
│ TODAY ───────────────────────────────────────────────────    │  ← day header: mono eyebrow + hairline
│  ●  Forged “Ship forge-os v1”                        14:32   │  ← white-hot spark, blooms
│  │                                                           │
│  ◍  Completed “Wire up the Forge Floor”              14:30   │  ← straw spark
│  │                                                           │
│  ◍  Completed “Build the API”                        13:05   │
│  │                                                           │
│  ○  Created “Learn to sail”                          11:20   │  ← temper-blue (cool)
│  │                                                           │
│  ·  Added “Charter solo” to “Learn to sail”          11:19   │  ← ash dot (dim)
│                                                              │
│ YESTERDAY ───────────────────────────────────────────────    │
│  ◍  Completed “Order cabinets”                       18:44   │
│  ·  Archived “Old side project”                      09:10   │  ← cooled/ash
└──────────────────────────────────────────────────────────────┘
```

- **Nav** — a small mono nav in the masthead links **Floor ↔ Log**, present on both pages.
  This is the one addition to the existing home masthead.
- **Day headers** — mono eyebrows: `TODAY`, `YESTERDAY`, then `WED · JUL 3`. A hairline rule
  fills the row. Days are the honest structural device here (the content *is* chronological),
  so no invented 01/02/03 numbering.
- **Event row** — spark on the rail · summary (verb-led, links to the goal) · right-aligned
  mono timestamp (`14:32`, `tabular-nums`). The whole row is the link target.
- Constrain to the same `max-width: 860px` column as the rest of the app.

## 5. Motion

One orchestrated moment, reduced-motion respected:
- **The log comes up to temperature** on load: the rail draws down (scaleY 0→1, ~500ms) and
  sparks light in sequence top-down (staggered ~40ms fade+rise). Once.
- **Hover a row:** the spark brightens and the summary shifts to `--chalk`. Nothing else.
- `prefers-reduced-motion`: everything renders final, instantly.

## 6. Voice

Forge vernacular in eyebrows only; summaries are plain, active past tense, and reuse the
app's exact vocabulary so the Log reads consistently with the Floor:

| Event | Summary |
|---|---|
| goal.created | `Created “<goal>”` |
| task.added | `Added “<task>” to “<goal>”` |
| task.completed | `Completed “<task>”` |
| status → achieved | `Forged “<goal>”` *(matches the Floor's "Forged")* |
| status → archived | `Archived “<goal>”` |
| status → active | `Reopened “<goal>”` |

- Eyebrow: `THE FORGE LOG`. Nav: `Floor` / `Log`. Timestamps carry the precision; the color
  carries the temperature; the verb carries the fact.
- **Empty state** (invitation, not mood): *"Nothing in the log yet. Work a goal on the forge
  floor — every stroke you make shows up here."* with a link to the Floor.

## 7. Quality floor

- **Never color-alone:** every event has its verb-led text summary; each spark carries an
  `aria-label` naming the event type. Color is reinforcement, never the sole signal.
- **Contrast:** summaries `--chalk` on `--slag`/`--iron`; timestamps/eyebrows `--ash` ≥ 4.5:1.
- **Focus:** each event row is a link with a visible `--focus` ring; the Floor/Log nav too.
- **Responsive:** the rail + rows keep their shape on mobile; timestamps stay right-aligned
  and wrap under the summary only if space forces it.
- Reduced motion honored (§5).

## 8. What this rejects

- **Generic timeline** (line + neutral dots + times) → replaced by heat-coded sparks that
  encode each event's energy, reusing the app's own data-color language.
- **Numbered markers (01/02/03)** → cut; time (day headers + timestamps) is the real ordering.
- **A new palette/type** → none; the Log must be unmistakably the same app, so it inherits the
  Floor's system wholesale and spends its one bold move on the rail's heat.
