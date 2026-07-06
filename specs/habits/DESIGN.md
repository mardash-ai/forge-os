# Habits — Design Spec

Extends the forge-os system (`specs/goals-and-tasks/DESIGN.md`). Read that first. Habits reuse the
app's committed dark "forge floor" and its **heat ramp** — nothing new in the palette.

## 1. Thesis

A streak is a **fire you keep lit.** The app's whole language is heat, and a habit is the purest
expression of it: stay consistent and the fire climbs the ramp from cold ember to white-hot; miss
a single period and it goes **cold**. So a habit doesn't show a number first — it shows a
*temperature*. The streak is legible as heat before you read the digits.

## 2. Signature — the streak as a banked fire

Each habit is a row led by an **ember** whose intensity is driven by the streak, mapped onto the
existing ramp (`--t0` cold → `--t2` → `--t3` → near-white):

```
┌────────────────────────────────────────────────────────────────┐
│ ◉  Morning pages                       🔥 12        [ Stoke ]   │  ← hot: long streak, due today
│    daily · best 21                        days                  │
├────────────────────────────────────────────────────────────────┤
│ ◉  Lift                                 ✓ 4         Kept lit    │  ← done this period (glowing)
│    weekly · best 9                        weeks                 │
├────────────────────────────────────────────────────────────────┤
│ ○  Read 20 pages                          0         [ Stoke ]   │  ← cold: broken/new
│    daily · best 6                       cold                    │
└────────────────────────────────────────────────────────────────┘
```

- **The ember** (leading each row) is the signature: a small disc/flame whose fill-color and glow
  come from `streakHeat(streak)`. 0 = a dark, dead coal (`--t0` at low alpha); a few periods =
  a warm ember (`--t2`); a long run = bright gold (`--t3`) with a soft bloom. It's a `radial-
  gradient` + `box-shadow`, not an image.
- **The streak number** sits at the same heat as its ember — big display digits + a unit
  (`days` / `weeks`). A broken streak reads `0 · cold`, not a lonely zero.
- **Due vs. kept:** if the current period isn't checked in, the row shows a **`Stoke`** button
  (accent) and the ember *gutters* (a slow, faint pulse — it needs tending). Once checked in, the
  button becomes a quiet **`Kept lit`** state and the ember holds steady and bright.

## 3. Tokens & type

No new palette. Ember/streak heat uses the ramp: `--t0 #38506b` (cold) → `--t2 #cb5320` →
`--t3 #e9a93c` → `#fbf1d6` (white-hot, from the existing heat-bar gradient). Buttons use
`--accent`; focus `--focus`; text `--chalk`/`--ash`. Type: Bricolage display for the streak
digits, Instrument body, IBM Plex Mono for the `daily · best N` meta line. The streak digits are
the one place type gets loud — everything else stays quiet (spend boldness in one place).

## 4. Motion

- **Stoke (check-in):** the ember flares up the ramp — a brief bloom + a step warmer — and settles
  at the new heat. One satisfying beat, no confetti.
- **Due (guttering):** a slow, low-amplitude opacity pulse on the ember only, so the eye is drawn
  to what still needs tending. Never on kept rows.
- **Broken:** the ember drops to cold on the next read (no dramatic animation — it's just cold).
- `prefers-reduced-motion`: no flare, no pulse — the heat is conveyed by color + the number alone.

## 5. Voice

- Action: **`Stoke`** (check in) → the row settles to **`Kept lit`**. Undo control: **`Undo`**.
- New-habit form: **`Start a habit`**, a title field, a `daily / weekly` choice, **`Light it`**.
- Meta line: `daily · best 12` (cadence + longest streak), IBM Plex Mono.
- Empty state (invitation, not a shrug): *"No habits yet. Light your first one and keep it lit."*
- Streak states in words: `0 · cold` · `1 day` · `12 days` · `4 weeks` — the unit follows cadence
  and pluralizes.

## 6. Quality floor

- **Never heat alone:** a habit's state is carried by the ember heat **and** the streak number
  **and** the `Stoke`/`Kept lit` label — not color alone (a cold streak also says `cold`).
- **Keyboard + focus:** `Stoke`, `Undo`, the cadence toggle, and `Light it` are all focusable with
  a visible `--focus` ring; the check-in control is a real button.
- **Contrast:** streak digits and labels hold ≥ 4.5:1 on `--forge`; the ember glow is decorative
  and never the only signal. Reduced motion honored.
- **Live update:** stoking updates the streak and ember without a full reload jar (router refresh).

## 7. What this rejects

- **A calendar grid of dots** (the default habit-tracker look) → rejected; it buries the one thing
  that matters (are you keeping it lit *now*) under a wall of history. The ember answers it
  instantly. History can come later if a feature needs it.
- **A progress bar** → rejected; a streak isn't "percent done," it's a temperature you sustain.
- **A new accent color for habits** → rejected; habits live on the same heat ramp as everything.
