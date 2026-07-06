# forge-os

**A personal operating system for running your life.** Everything in forge-os revolves
around **Goals**: you name what you want to achieve, break it into **Tasks**, and watch each
Goal's progress rendered as *heat* — cold and dark when untouched, glowing as it nears done.

forge-os is built and run entirely through **Forge** — a Docker-first, API-first software
creation platform. You describe outcomes; Forge scaffolds, builds, tests, and runs the app in
Docker. You never run `npm`/`next`/`node` on your machine.

## Requirements

Just **Docker** (with the Compose plugin — included in Docker Desktop). No Node, npm, or
anything else on the host.

> Forge runs as its **control plane** image (`ghcr.io/mardash-ai/forge-control-plane`) — the
> developer/orchestration runtime — alongside this repo as a container.

## This repo is a single app

Every Forge repo holds exactly one app, living at **`./app`**:

| Path | What it is |
|---|---|
| `app/` | **The app** — the product. Next.js (App Router) + TypeScript. Router at `app/app/`, logic at `app/lib/`, tests at `app/tests/`. |
| `specs/` | Feature specs. `specs/ADD_A_FEATURE.md` (how-to) + `specs/<feature>/{FEATURE,DESIGN}.md`. |
| `.forge/` | Forge's local Resource/Event/log store (gitignored). |
| `.claude/skills/` | `add-a-feature`, `provision-app`, `frontend-design`. |
| `./forge`, `./new-app` | The launcher — a thin CLI to the Forge control-plane container. |
| `compose.yaml`, `Makefile` | Start/stop the platform. Leave them alone. |

There is **no Forge source in this repo** — Forge is a black-box platform you use through
`./forge` / `./new-app` (and the HTTP API on `http://localhost:3717`).

## Run it

```bash
make up                               # start the Forge platform (once per session)
./forge dev --app forge-os            # start the app → http://localhost:3000
./forge dev --app forge-os --stop     # stop it
```

Rebuild / test / lint after changes, or inspect the app without reading files:

```bash
./forge build   --app forge-os
./forge test    --app forge-os
./forge lint    --app forge-os
./forge inspect app|routes|scripts|docker|events --app forge-os
./forge explain --resource <id>       # compact failure diagnosis (no log dump)
```

Every `./forge` command returns compact JSON with a `suggested_next` hint. Add `--summary`
for human-readable output, or `./forge logs <id> --full` for a full log.

> **Postgres:** forge-os persists goals & tasks in Postgres. If `./forge dev` reports host
> port `5432` already allocated (another project's database), the app reaches Postgres
> *internally* at `postgres:5432` — just remap the **host** port in `app/compose.yaml`
> (e.g. `5433:5432`).

## Add a feature (spec-driven, design-first)

Write a short spec — a Goal plus acceptance criteria — in `specs/<feature-slug>/FEATURE.md`,
then tell Claude:

> **"Add a feature — implement `specs/<feature-slug>/FEATURE.md`."**

Claude runs the **`add-a-feature`** skill: it firms up the spec, designs the UI first (via
the **`frontend-design`** skill, often with an interactive mockup to approve), implements
under `./app`, validates with `./forge lint/build/test`, and verifies the behavior in the
running app. See **[specs/ADD_A_FEATURE.md](specs/ADD_A_FEATURE.md)** for the template and
**[specs/goals-and-tasks/](specs/goals-and-tasks/)** for this app's core spec + design.

## Let Claude drive

This repo ships Claude Code skills and a `CLAUDE.md`. Open it in Claude Code and just say what
you want — *"add habits that reset weekly"*, *"show goals due this month"* — and Claude runs
the right skill, fixes failures itself via `forge explain`, and iterates. You never have to
remember commands.

## Platform commands

```bash
make up / make down          # start / stop the platform
make logs / make shell       # tail logs / shell into the platform
make pull                    # update the control-plane image
```

## Running more than one Forge project at once

One Forge platform binds one port (default `3717`). To run a second project simultaneously,
copy `.env.example` to `.env` and set a unique `FORGE_PORT`.
