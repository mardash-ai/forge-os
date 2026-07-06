# Reminders & Notifications — Design Spec

Extends the forge-os system (`specs/goals-and-tasks/DESIGN.md`) — same dark world, tokens, and
type. Read that first; this adds only what's new.

---

## 1. Thesis

The inbox is where **heat has gone wrong at both ends**: work that's **too hot** (overdue,
burning) and goals that have gone **too cold** (neglected). It unifies the app's two existing
color languages — Today's ember-red urgency and the Floor/Log heat ramp — so a notification's
**temperature states its nature** before you read it.

Like Today, this is a scan-and-act tool: quiet by default, loud only where something's wrong.

## 2. Signature — hot vs. cold notifications

Two kinds, each speaking the color it already means elsewhere:

| Kind | Marker | Reads as |
|---|---|---|
| **Overdue** (a task past due) | ember stripe + dot `--warn #D0503A` | burning — act now |
| **Cold goal** (no activity 7+ days) | temper-blue stripe + dot `--t0 #38506B` | gone cold — reheat it |

The stripe + dot on each row *are* the signature: a red row burns, a blue row has cooled. No
new palette — the meaning is carried by heat the user already understands.

## 3. Reused tokens & type

Surfaces `--slag`/`--iron`/`--iron-edge`; text `--chalk`/`--ash`; **`--warn #D0503A`** (overdue,
from Today) and **`--t0 #38506B`** (cold, from the heat ramp). Type: Bricolage / Instrument /
IBM Plex Mono. Dark, committed.

## 4. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ FORGE·OS              Floor · Today · Log · [ Alerts ③ ]       │  ← nav gains Alerts + red count
│                                                              │
│ ATTENTION                                                    │  ← eyebrow (mono)
│ What needs a look                                            │  ← Bricolage
│                                                              │
│ OVERDUE  2 ───────────────────────────────────────────────   │  ← section (red label)
│ ▎●  “Email the contractor” is 2 days overdue                  │  ← ember stripe + dot + message
│      Renovate the kitchen                          Dismiss ×  │  ← goal link · dismiss
│ ▎●  “Draft the launch note” is 1 day overdue                  │
│      Ship forge-os v1                              Dismiss ×  │
│                                                              │
│ GONE COLD  1 ─────────────────────────────────────────────   │  ← section (blue label)
│ ▎○  “Learn to sail” has gone cold — no activity in 9 days     │  ← cold stripe + dot
│      Learn to sail                                Dismiss ×  │
└──────────────────────────────────────────────────────────────┘
```

- **Row** = a left stripe + a dot (red/blue) · the **message** (specific: what and how long) ·
  the **goal** (dim, links) · a **Dismiss** control. Dismiss removes the row in place.
- **Sections** = `Overdue` then `Gone cold`, mono eyebrow + count + hairline. Overdue always
  first (most urgent). Empty sections omitted.
- **Nav badge** = a small **ember-red pill** with the active count next to `Alerts`; hidden at 0.
  Notifications should pull the eye, so this is the one spot allowed a bit of saturation in the
  masthead.
- Same `max-width: 860px` column.

## 5. Motion

Calm. Rows fade+rise on load (like Today/Log). **Dismiss** → the row fades and collapses out.
Nothing pulses. `prefers-reduced-motion`: instant.

## 6. Voice

- Eyebrow `ATTENTION`; sections `Overdue` / `Gone cold` (plain, recognizable). Nav: `Alerts`.
- **Messages** are specific and verb/state-led:
  - overdue → `“<task>” is 2 days overdue` (`1 day overdue` singular).
  - cold → `“<goal>” has gone cold — no activity in 9 days`.
- **Dismiss** means acknowledge-and-hide; it says `Dismiss` and the row leaves. (The task still
  lives on Today; the goal still lives on the Floor — dismissing the alert doesn't delete
  anything.)
- **Empty state** (reassurance, not blank): *"All clear. Nothing's overdue, and every goal's
  been worked lately."*

## 7. Quality floor

- **Never color-alone:** the message text always states the kind ("overdue" / "gone cold") and
  the count of days; the stripe/dot reinforce. The nav badge pairs its color with the number.
- **Contrast:** `--warn` and cold `--t0` dots/labels legible on `--iron`; messages `--chalk`.
- **Focus:** the goal link and Dismiss control have visible `--focus` rings; keyboard operable.
- **Responsive:** the Dismiss control wraps under the message on narrow screens; goal stays a
  tap target. The nav badge stays beside `Alerts`.
- Reduced motion honored.

## 8. What this rejects

- **A generic notification bell/list** → distinguished by the hot/cold temperature encoding
  that reuses the app's own meanings, and by being derived from real state (so it self-clears).
- **A new alert color** → none; overdue borrows Today's red, cold borrows the ramp's blue. The
  inbox is the meeting point of the two languages, not a third one.
- **Stored, ever-growing notification rows** → notifications are computed live; only dismissals
  persist. (The absence of a push/scheduler is deliberate — it's the platform gap this feature
  exists to expose.)
