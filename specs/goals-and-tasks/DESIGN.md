# forge-os — Design Spec

The visual and interaction system for forge-os. This is the durable reference that
implementation follows; every color, type, and layout decision below is derived
from one idea, not assembled from defaults.

---

## 1. The thesis

forge-os is a **personal operating system for running your life**, and everything
in it revolves around Goals. Two vocabularies live in that name and the design
holds both in tension:

- **The forge** — craft, heat, metal shaped by deliberate, repeated effort. A goal
  is raw material worked over time; tasks are the hammer strokes.
- **The OS** — precision, state, resources, events, telemetry. Forge itself records
  every action as a Resource and an Event; the app mirrors that.

The design is a **precision instrument warmed by a forge** — a systems console you
could read the temperature of a life on.

### Why the room is dark (the one justification that earns the dark UI)
A real smithy is kept dim on purpose: a smith reads a metal's working temperature
by the color of its glow, which only works in low ambient light. forge-os is dark
for the same functional reason — so the **heat scale that encodes progress is
legible**. The darkness is a choice the subject demands, not a mood.

---

## 2. Signature element — The Heat Bar / The Forge Floor

**This is the one thing the app is remembered by. Spend the boldness here; keep
everything else quiet.**

Progress is not a neutral blue bar with a percentage. It is **temperature**. Each
goal's completion maps onto the blackbody / tempering ramp a smith actually reads:

```
0% ─────────── 25% ─────────── 50% ─────────── 75% ─────────── 100%
temper-blue     dull red        forge-orange     straw           white-hot
cold, unworked  just catching   working heat     nearly there    forged
```

- A goal's **Heat Bar** fills from the cold end up to the color at its current
  percent, with an outer **glow whose intensity scales with progress** (cold = no
  bloom; hot = bright bloom) and a thin bright "working edge" at the fill boundary.
- The **Forge Floor** (home page) stacks every active goal's Heat Bar. Cold goals
  sit dark, near-done goals glow — so the whole screen answers *"what's hot in my
  life right now?"* before you read a single word. That field **is** the hero.
- Color is decoration of *data*, never decoration alone: the bar always ships with
  a plain monospace readout (`3 / 4 · 75%`) and an accessible label. Heat is the
  poetry; the number is the truth.

---

## 3. Color

Warm-tinted charcoal (a forge interior), never cold blue-black, never pure #000.

### Surfaces & text
| Token | Hex | Use |
|---|---|---|
| `--slag` | `#16120E` | Page background — the dark forge interior |
| `--forge` | `#1E1915` | Base panels, unfilled bar track |
| `--iron` | `#2A231D` | Raised cards |
| `--iron-edge` | `#3A312A` | Hairline borders, dividers |
| `--ash` | `#A69C90` | Secondary / supporting text (warm grey) |
| `--chalk` | `#EFE7DA` | Primary text — chalk mark on cooled metal |

### The heat ramp (sequential — encodes progress 0→100)
| Token | Hex | Reads as |
|---|---|---|
| `--t0` | `#38506B` | temper-blue — cold, unworked (0%) |
| `--t1` | `#7E2B18` | dull red — just catching (~25%) |
| `--t2` | `#CB5320` | forge-orange — working heat (~50%) |
| `--t3` | `#E9A93C` | straw — nearly forged (~75%) |
| `--t4` | `#FBF1D6` | white-hot — forged (100%) |

The fill is a gradient sampling `--t0 → (color at current %)`, so a bar's endpoint
color *is* its progress. Glow = `box-shadow` in the endpoint color, opacity ∝ %.

### Interactive & semantic
| Token | Hex | Use |
|---|---|---|
| `--accent` | `#CB5320` | Single interactive accent (= `--t2`); primary buttons, links |
| `--focus` | `#E9A93C` | Focus ring (straw — high visibility on dark) |
| `--warn` | `#D0503A` | Errors / rejected input (400s). Distinct from the heat ramp |

One interactive accent, drawn from the middle of the ramp so buttons feel part of
the same fire. Do not introduce a second brand color.

---

## 4. Typography

Three roles. The display voice is crafted; the system voice is instrument-grade.
All three are on Google Fonts (load via `next/font`).

- **Display — Bricolage Grotesque** (600–800). A contemporary grotesque with
  slightly irregular, mechanical-humanist details — reads as *forged*, not
  delicate. Goal titles, mastheads. Tight tracking (`-0.02em`), never loose.
  *(Deliberately not the high-contrast editorial serif that every AI cream-page reaches for.)*
- **Body — Instrument Sans** (400/500). Quiet, legible, slightly narrow. All
  descriptions and running UI text. Its job is to disappear.
- **Telemetry — IBM Plex Mono** (400/500). The OS instrument layer: eyebrows,
  labels, progress readouts, resource IDs, timestamps, counts. Uppercase +
  letter-spaced for labels; `tabular-nums` for all numeric readouts.

### Scale
| Role | Size | Face / weight | Notes |
|---|---|---|---|
| Masthead | 56px / 3.5rem | Bricolage 800 | tracking -0.03em, line 1.0 |
| Page title | 36px / 2.25rem | Bricolage 700 | goal detail title |
| Goal title | 22px / 1.375rem | Bricolage 700 | on cards |
| Body | 16px / 1rem | Instrument 400 | line-height 1.55 |
| Small | 14px / 0.875rem | Instrument 400/500 | |
| Eyebrow / label | 12px / 0.75rem | Plex Mono 500 | UPPERCASE, tracking 0.14em |
| Readout | 13px / 0.8125rem | Plex Mono 500 | tabular-nums |

---

## 5. Layout

### Home — `/` — The Forge Floor
The most characteristic thing in the subject's world opens the page: the heat field.
No hero big-number template.

```
┌───────────────────────────────────────────────────────────────┐
│ FORGE·OS                        6 ON THE ANVIL · 2 FORGED · 1 COLD │  ← masthead, mono status line
├───────────────────────────────────────────────────────────────┤
│ THE FORGE FLOOR                                    [ + New goal ] │  ← eyebrow (mono) + action
│ What's hot right now                                             │  ← Bricolage
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Ship forge-os v1                              ● Active        │ │  ← Bricolage title + status chip
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░  glowing straw     3 / 4 · 75%     │ │  ← Heat Bar + mono readout
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Learn to sail                                 ● Active        │ │
│ │ ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░  dull red          1 / 5 · 20%     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Read 12 books                                 ● Active        │ │
│ │ ░░░░░░░░░░░░░░░░░░░░░░░░░░  cold temper-blue   0 / 12 · 0%     │ │
│ └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

Active goals sort hottest-first (most complete on top) so the floor reads as a
temperature gradient. Achieved and Archived collapse into quieter sections below.

### Goal detail — `/goals/[id]` — On the Anvil
One billet, worked. Tasks are the hammer strokes that raise its heat.

```
┌───────────────────────────────────────────────────────────────┐
│ ← THE FORGE FLOOR                              RESOURCE · GOAL   │  ← breadcrumb + mono resource tag
│                                                                 │
│ Ship forge-os v1                                                │  ← Bricolage 36px
│ [ Active ] [ Achieved ] [ Archived ]           3 / 4 · 75%      │  ← status control + readout
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░  ← big Heat Bar, straw, glowing   │
│                                                                 │
│ The first release: goals, tasks, and progress you can see.      │  ← description, Instrument Sans
│                                                                 │
│ HAMMER STROKES                                                  │  ← eyebrow (mono)
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ✓  Define the domain model            (struck — dim + glow)   │ │
│ │ ✓  Provision Postgres                                        │ │
│ │ ✓  Build the API                                             │ │
│ │ ○  Wire up the Forge Floor            [ Mark complete ]       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ [ Add a task…                                        ] [ Add ]  │
└───────────────────────────────────────────────────────────────┘
```

### Structure rules
- **No 01 / 02 / 03 numbering.** v1 tasks aren't ordered (a non-goal), so numbered
  markers would encode a sequence that doesn't exist. Tasks use a strike/check mark.
- Eyebrows and dividers carry meaning (status, resource type), never decorate.
- Hairline dividers in `--iron-edge`; radius kept small and consistent (6px cards,
  2px bars) — machined, not soft.

---

## 6. Motion

One orchestrated moment, then restraint. All of this is gated behind
`prefers-reduced-motion`.

- **Coming up to temperature (load):** Heat Bars fill from 0 to their value over
  ~700ms ease-out, staggered ~60ms per row. Once, on first paint.
- **Striking hot metal (complete a task):** the parent Heat Bar advances to its new
  percent with a 250ms ember pulse — glow blooms then settles — and the task's
  strike mark draws in. This is the payoff interaction; make it feel earned.
- **Hover a goal card:** 1px lift + the working edge brightens. Nothing more.
- **Reduced motion:** bars render at final value instantly; no pulse, no stagger.
  State changes still fully legible.

---

## 7. Voice & copy

The forge poetry lives in **non-interactive eyebrows and the visual**, never in the
controls. Controls say exactly what they do, in the user's words.

| Surface | Register | Examples |
|---|---|---|
| Eyebrows / section labels (mono) | Forge vernacular | `THE FORGE FLOOR`, `ON THE ANVIL`, `HAMMER STROKES`, `RESOURCE · GOAL` |
| Buttons / controls | Plain, active voice | `New goal`, `Add task`, `Mark complete`, `Active / Achieved / Archived` |
| Status chips | What people recognize | Active · Achieved · Archived (not clever synonyms) |
| Readouts | Honest & numeric | `3 / 4 · 75%` — color carries the temperature, the number carries the fact |

- **Empty forge floor:** an invitation, not a shrug — e.g. *"Nothing on the anvil
  yet. Name a goal and start working it."* with the `New goal` action.
- **A goal with no tasks:** *"No strokes yet. Add the first task to start heating
  this goal."*
- **Rejected input (400 — empty title):** interface voice, specific, no apology —
  *"A goal needs a title."* / *"A task needs a title."* Inline, in `--warn`.
- Consistency: the button that says `Mark complete` produces the strike + the same
  goal's heat rising — the action keeps its meaning through the whole flow.

---

## 8. Quality floor (non-negotiable, un-announced)

- **Responsive to mobile:** cards stack full-width; masthead status line wraps under
  the wordmark; Heat Bars keep full width and readouts stay right-aligned.
- **Never color-alone:** every heat state pairs with the numeric readout and an
  `aria-label` (e.g. `Progress: 75%, 3 of 4 tasks`). Status chips carry a label,
  not just a dot color.
- **Contrast:** chalk on slag/iron ≥ 7:1; ash on iron ≥ 4.5:1; straw/orange readouts
  on dark ≥ 4.5:1. Verify white-hot text never drops below 4.5:1 on `--iron`.
- **Focus:** visible 2px `--focus` (straw) ring with 2px offset on every interactive
  element. Full keyboard operability for add-task, complete, and status controls.
- **Reduced motion respected** everywhere (§6).

---

## 9. What this rejected, and why (so the choices stay deliberate)

- **Dark + single hot-orange accent** → that's a templated AI default. Replaced the
  fixed accent with a **temperature ramp that encodes data**; the dark base is now
  earned by the subject (§1).
- **Cream + high-contrast serif + terracotta** → the other default; wrong register
  for an instrument. Warm charcoal + grotesque + mono instead.
- **Big-number hero** → replaced with the Forge Floor heat field, which shows state
  instead of asserting it.
- **01 / 02 / 03 numbering** → cut, because v1 tasks carry no order.
- **Forge-flavored button labels** ("Strike!", "Temper") → cut, because controls
  must name what people do. Flavor stays in eyebrows and the visual only.
