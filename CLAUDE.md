# CLAUDE.md

This is a **Forge Builder workspace** — a project where you create and iterate on apps through the **Forge** platform, not by writing files and running build tools directly.

## The one rule

**Do all app lifecycle work through `./forge` (or `./new-app`). Never run `docker`, `npm`, `next`, or `node` directly, and never `cat`/read an app's source to check its state.**

Forge runs everything in Docker, records each action as a Resource, and returns compact JSON. Going around it loses reproducibility and wastes tokens.

## Fastest path: one command

To scaffold and fully validate a new app end-to-end:

```bash
./new-app <kebab-name> [--with-postgres] [--with-redis] [--dev]
```

`new-app` runs the whole runbook (init → provision → install → build → test → lint), applies the step gate after each step, auto-diagnoses failures with `forge explain`, and prints a done summary. Use this when the human just wants an app created.

## Adding a feature to an existing app

Read **`ADD_A_FEATURE.md`** — it's the spec-driven workflow. The human gives you a short feature spec (Goal + acceptance criteria); you implement it under `apps/<name>/` following Forge conventions (logic in `lib/`, pages in `app/`, tests in `tests/`), then validate with `./forge lint/build/test` and self-heal via `./forge explain` until green. If the human hasn't written a spec, infer one from their request using that file's template, and only ask about choices that are hard to reverse (e.g. does the data need to persist across restarts?).

## Iterating afterward (or for a feature Goal)

Use the granular capabilities and the **`provision-app` skill** (`.claude/skills/provision-app/SKILL.md`), which is the authoritative runbook:

```bash
./forge init app --name <name>            # scaffold
./forge provision|install|build|test|lint --app <name>
./forge inspect app|routes|scripts|docker|events --app <name>
./forge explain --resource <id>           # diagnose a failure (don't read logs)
./forge plan --app <name> --goal "…"      # frame a feature Goal as a plan
```

- Branch on the JSON `.status` field, not the exit code (`build`/`test`/`lint` exit 0 even on failure).
- On `"failed"`, run `./forge explain --resource <id>` and fix only the files it names.
- `--summary` for human-facing output; `--raw` only if explicitly asked.

## Layout

- `apps/<name>/` — the apps you create (this is the product; commit it).
- `.forge/` — Forge's Resource/Event/log store (local, gitignored).
- `./forge`, `./new-app`, `compose.yaml`, `Makefile` — the launcher. Leave these alone.

Forge is consumed as a black-box platform (CLI/API only). There is no Forge source here to edit.
