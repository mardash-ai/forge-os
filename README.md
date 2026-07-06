# Forge Starter

The drop-dead simplest way to start building with **Forge**. This is *your project* — Forge runs alongside it as a container. Everything runs in Docker.

## Requirements

Just **Docker** (with the Compose plugin — included in Docker Desktop). No Node, npm, or anything else.

> Forge runs as its **control plane** image (`ghcr.io/mardash-ai/forge-control-plane`) — the developer/orchestration runtime. (A separate, slimmer **data plane** image handles production/deploy later; it won't carry developer dependencies.)

## From zero to a working app — one command

```bash
# 1. Get this starter (or click "Use this template" on GitHub)
git clone https://github.com/mardash-ai/forge-starter my-project
cd my-project

# 2. Create a fully built, tested, linted app in one command:
./new-app my-app
```

`./new-app` starts the platform, then runs the whole lifecycle — **init → provision → install → build → test → lint** — checking each step, diagnosing any failure for you, and printing a summary. Options:

```bash
./new-app my-app --with-postgres      # add a Postgres service
./new-app my-app --with-redis         # add a Redis service
./new-app my-app --dev                # also start the dev server and wait for health
```

Your app is created in `apps/my-app/`. Run it any time:

```bash
./forge dev --app my-app              # http://localhost:3000
```

## Even simpler: let Claude drive

This starter ships a Claude Code skill (`.claude/skills/provision-app`) and a `CLAUDE.md`. Open the project in Claude Code and just say:

> **"Build me a task tracker."**

Claude runs `./new-app` (or the granular steps), fixes failures itself using `forge explain`, and iterates. You never have to remember commands.

## Iterating step by step

Once an app exists, work capability by capability:

```bash
./forge build --app my-app            # rebuild after edits
./forge test  --app my-app
./forge lint  --app my-app
./forge inspect app|routes|scripts|docker|events --app my-app
./forge explain --resource <id>       # compact failure diagnosis (no log dump)
./forge plan --app my-app --goal "Add project tracking"
```

Every `./forge` command returns compact JSON with a `suggested_next` hint. Add `--summary` for human-readable output, or `./forge logs <id> --full` for a full log.

## Adding features (spec-driven)

Build on your app by writing a short feature spec (a Goal + acceptance criteria) and letting Claude implement and validate it. See **[ADD_A_FEATURE.md](ADD_A_FEATURE.md)** for the template plus bare-bones and robust examples.

## What is this directory?

| Path | What it is |
|---|---|
| `apps/<name>/` | The apps you build. **This is your product — commit it.** |
| `.forge/` | Forge's local Resource/Event/log store (gitignored). |
| `./new-app` | One command: scaffold + validate a new app. |
| `./forge` | Thin CLI → talks to the Forge control-plane container. |
| `compose.yaml`, `Makefile` | Launch the platform. Leave them alone. |

There is **no Forge source here** — Forge is a black-box platform you use through `./forge` / `./new-app` (and the HTTP API on `http://localhost:3717`). Your app never imports Forge internals.

## Commands

```bash
./new-app <name>            # scaffold + build + test + lint a new app (one command)
make up / make down          # start / stop the platform
make logs / make shell       # tail logs / shell into the platform
make pull                    # update the control-plane image
```

## Running more than one project at once

One Forge platform binds one port (default `3717`). To run a second project simultaneously, copy `.env.example` to `.env` and set a unique `FORGE_PORT`.
