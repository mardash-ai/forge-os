# Time & Today — Design Spec

Extends the forge-os system (`specs/goals-and-tasks/DESIGN.md`) — same dark world, tokens, and
type. This spec only adds what's new. Read that first.

---

## 1. Thesis

The Floor and the Log spend the app's boldness on **heat**. **Today is the calm, precise
counterpart** — a focus board that answers *what should I work now?*. Its one loud signal is
**urgency**, and it's deliberately encoded *away* from the heat ramp so the two languages never
collide: heat = energy/progress; **ember-red = time pressure**.

Match complexity to the job: this is a tool you scan and act on, so the craft goes into
information design and restraint, not a big hero.

## 2. Signature — the urgency stripe + due chip

Every task on the board carries a **due chip** (mono, right-aligned) and, when late, a **left
ember stripe**. Overdue work is unmissable; everything else stays quiet.

| Bucket | Stripe / chip | Reads as |
|---|---|---|
| **Overdue** | 3px left stripe `--warn #D0503A`; chip red ("3 days ago") | act now |
| **Today** | chip `--accent #CB5320` ("Today") | on the anvil |
| **This week** | chip `--ash` ("Tomorrow", "Wed") | coming up |
| **Later** | chip dim `#6f665c` ("Jul 15") | on the horizon |

The stripe + chip *are* the memorable thing here — a scannable board where lateness burns and
the rest is calm. No new palette, no heat bars.

## 3. Reused tokens & type

Surfaces `--slag`/`--iron`/`--iron-edge`; text `--chalk`/`--ash`; accent `--accent #CB5320`;
**semantic urgency `--warn #D0503A`** (distinct from the accent, per "UI, not document"). Type:
Bricolage (display) / Instrument (body) / IBM Plex Mono (chips, counts). Dark, committed.

## 4. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ FORGE·OS                       Floor · [ Today ] · Log         │  ← nav gains Today
│                                                              │
│ ON THE ANVIL                                                 │  ← eyebrow (mono)
│ What needs working                                           │  ← Bricolage
│                                                              │
│ OVERDUE  2 ───────────────────────────────────────────────   │  ← bucket header (mono + count)
│ ▎ ○  Email the contractor        Renovate the kitchen  2d ago │  ← ember stripe + strike + goal + red chip
│ ▎ ○  Draft the launch note       Ship forge-os v1      1d ago │
│                                                              │
│ TODAY  1 ─────────────────────────────────────────────────   │
│   ○  Long run 18k                Run a half marathon    Today │  ← accent chip
│                                                              │
│ THIS WEEK  2 ─────────────────────────────────────────────   │
│   ○  Book the rigging lesson     Learn to sail          Wed   │  ← ash chip
│   ○  Read chapter 4              Read 12 books this year Fri   │
│                                                              │
│ LATER  1 ─────────────────────────────────────────────────   │
│   ○  Charter solo                Learn to sail          Jul 15│  ← dim chip
└──────────────────────────────────────────────────────────────┘
```

- **Row** = a **strike control** (the same `○ → ✓` mark used on the goal detail — completing a
  task is "striking" it, consistent vocabulary) · task title · its **goal** (dim, links) · the
  **due chip** (right). The strike completes it in place; the row then leaves the board.
- **Buckets** = mono eyebrow + count + hairline rule, in fixed order Overdue → Today → This week
  → Later. Empty buckets are omitted entirely.
- Same `max-width: 860px` column as the rest of the app.
- **Goal detail gets due dates too:** each open task row shows its due chip and a compact
  control to set/clear a date (a styled native date input) — so dates are set where tasks live,
  and surfaced on the board.

## 5. Motion

Calm. Rows fade+rise in with a small top-down stagger on load (like the Log). Strike →
the row fades out as it leaves the board. Hover brightens the strike mark. Nothing pulses —
urgency is carried by color, not motion. `prefers-reduced-motion`: instant, no stagger.

## 6. Voice

- Eyebrow `ON THE ANVIL`; buckets `Overdue` / `Today` / `This week` / `Later` (plain, what
  people recognize). Nav adds `Today`.
- **Due labels** (relative, specific): `Today`, `Tomorrow`, weekday (`Wed`) within the week,
  `Jul 15` beyond; overdue counts up: `1 day ago`, `3 days ago`.
- **Empty state** (invitation): *"Nothing due. Give a task a date from its goal and it'll show
  up here when it's time to work it."* with a link to the Floor.
- The strike keeps its meaning everywhere: the control that says "mark complete" removes the
  task and (via the Log) records "Completed …".

## 7. Quality floor

- **Never color-alone:** every bucket has its text heading; overdue rows carry the "N ago" chip
  text *and* the stripe; the due chip always states the date/relative label. Color reinforces.
- **Contrast:** `--warn` and `--accent` chips on `--iron` ≥ 4.5:1; ash/dim chips legible.
- **Focus:** the strike control and each goal link have visible `--focus` rings; full keyboard
  operability. The date input is a real, labeled control.
- **Responsive:** rows reflow — the due chip wraps under the title on narrow screens; the goal
  stays a tap target.
- Reduced motion honored.

## 8. What this rejects

- **Reusing heat for urgency** → rejected; would muddy the app's core signal. Urgency gets its
  own ember-red language, kept separate from the progress ramp.
- **A generic bucketed to-do list** → distinguished by the ember overdue stripe, mono due chips,
  the shared "strike" vocabulary, and the forge framing — and by being *actionable* (complete +
  navigate), not a static list.
- **A calendar/month grid** → out of scope; the job is "what now?", answered by four urgency
  buckets, not a date picker to browse.
