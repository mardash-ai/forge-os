# CLAUDE.md

This is a **Forge Builder workspace** — a project where you create and iterate on **one app**
through the **Forge** platform, not by writing files and running build tools directly.

**Every repo is a single app, and it lives at `./app`.** (The control plane runs in
single-app mode, `FORGE_APP_LAYOUT=single`.)

## Why this project exists — the wind tunnel

forge-os is **not just a demo — it is the wind tunnel for Forge.** Every new Forge capability
should exist because *this application genuinely needs it* — not because the architecture says
it should. That mirrors how durable platforms actually grew:

- Git was built to support Linux kernel development.
- Kubernetes evolved to run Google's workloads.
- Stripe built many internal platform capabilities to support real products.

So when you choose and shape features, prefer the one that puts **real pressure** on the
platform, and name the Forge capability each feature forces into existence. A feature that
exercises a genuine gap is worth more than one that just adds surface. The app should
continuously pressure Forge to become a better platform.

**Track that pressure in [`PLATFORM_CAPABILITIES.md`](PLATFORM_CAPABILITIES.md)** — the ledger of
platform capabilities forge-os needs that should be built *in Forge* and shared, plus what
refactors out of `./app` once they exist. Every feature updates it (step 6 of the `add-a-feature`
skill). `PROJECT_IDEA.md` tracks the *features*; this tracks the *platform debt* they create.

## Keep the starter template in sync

There's a second place generic value can belong: this repo was scaffolded from the
**forge-starter** template. If you add something that should exist in *every* Forge web app — a
scaffolding convention, a shared skill, a config default, a lint/test setup, a broadly useful
helper — mirror it into forge-starter too. Unlike platform capabilities, this is deliberately
**lightweight and opportunistic**: no ledger, no handoff, no version tracking — just update the
template when the opportunity arises. It happens far less often than pressure on Forge itself;
the vast majority of work is forge-os-specific (domain logic, features, the wind-tunnel process)
and should **not** touch the starter. When in doubt, ask: *would a brand-new, unrelated Forge app
want this on day one?* If yes, it belongs in the starter.

## The one rule

**Do all app lifecycle work through `./forge` (or `./new-app`). Never run `docker`, `npm`,
`next`, or `node` directly, and never `cat`/read the app's source to check its state.**

Forge runs everything in Docker, records each action as a Resource, and returns compact JSON.
Going around it loses reproducibility and wastes tokens.

## Fastest path: one command

To scaffold and fully validate the app end-to-end:

```bash
./new-app <kebab-name> [--with-postgres] [--with-redis] [--dev]
```

`new-app` runs the whole runbook (init → provision → install → build → test → lint), applies
the step gate after each step, auto-diagnoses failures with `forge explain`, and prints a
done summary. The app scaffolds into `./app`.

## Adding or evolving a feature

Use the **`add-a-feature` skill** (`.claude/skills/add-a-feature/SKILL.md`) — it's the source
of truth for the spec-driven, design-first workflow:

1. The human gives a short feature spec (Goal + acceptance criteria) → you save it at
   `specs/<feature-slug>/FEATURE.md`. If they didn't write one, infer it, and only ask about
   choices that are hard to reverse (e.g. *must this data persist across restarts?*).
2. **Design first for any UI** — produce `specs/<feature-slug>/DESIGN.md` via the
   **`frontend-design` skill** (and often an interactive mockup) before writing components.
3. Implement under `./app` (logic in `app/lib/`, pages in `app/app/`, tests in `app/tests/`).
4. Validate with `./forge lint/build/test` and self-heal via `./forge explain` until green.
5. Verify the behavior end-to-end (drive the running app; check persistence; screenshot UI).

## Iterating with the granular capabilities

The **`provision-app` skill** (`.claude/skills/provision-app/SKILL.md`) is the authoritative
runbook for the Forge mechanics:

```bash
./forge init app --name <name>            # scaffold into ./app (one app per repo)
./forge provision|install|build|test|lint --app <name>
./forge inspect app|routes|scripts|docker|events --app <name>
./forge explain --resource <id>           # diagnose a failure (don't read logs)
./forge plan --app <name> --goal "…"      # frame a feature Goal as a plan
```

- Branch on the JSON `.status` field, not the exit code (`build`/`test`/`lint` exit 0 even on failure).
- On `"failed"`, run `./forge explain --resource <id>` and fix only the files it names (under `./app/`).
- `--summary` for human-facing output; `--raw` only if explicitly asked.

## Layout

- `app/` — **the app** (this is the product; commit it). Next.js App Router lives at `app/app/`,
  logic at `app/lib/`, tests at `app/tests/`.
- `specs/` — feature specs. `specs/ADD_A_FEATURE.md` (how-to) + `specs/<feature-slug>/{FEATURE,DESIGN}.md`.
- `.forge/` — Forge's Resource/Event/log store (local, gitignored).
- `.claude/skills/` — `add-a-feature`, `provision-app`, `frontend-design`.
- `./forge`, `./new-app`, `compose.yaml`, `Makefile` — the launcher. Leave these alone.

Forge is consumed as a black-box platform (CLI/API only). There is no Forge source in this
repo to edit.
