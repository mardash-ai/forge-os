---
name: provision-app
description: Create and validate this repo's single Dockerized web app through the Forge platform, and run the build/test/lint mechanics for it. Use whenever the human asks to scaffold/create the app, or wants a change actually initialized, installed, built, tested, and linted. Everything runs in Docker via ./forge. For the spec-driven, design-first authoring of a feature, use the add-a-feature skill (this skill is the mechanics it calls).
---

# Provision & validate an app with Forge

You are executing a procedure. Run the commands, parse the one-line JSON each prints, and
branch on `status`. Do not read app source or dump logs unless a step says to.

**This workspace is single-app.** Every repo holds exactly one app, and it lives at **`./app`**
(the control plane is set to `FORGE_APP_LAYOUT=single`). `./forge …--app <name>` still takes a
name — it's the app's identity/label — but there is only one app and it resolves to `./app`.
`./forge init` scaffolds *into* `./app`, and a second `init` is rejected.

> This skill is the **mechanics**. To author a feature (spec → design → implement → verify),
> use the **`add-a-feature`** skill, which calls these commands.

## Fast path (prefer this for "just make the app")

```bash
./new-app <kebab-name> [--with-postgres] [--with-redis] [--dev]
```

`new-app` runs the entire procedure below (init → provision → install → build → test → lint),
applies the step gate, auto-diagnoses failures, and prints a done summary. If it exits
non-zero it prints a diagnosis (cause + files + fix) — apply the fix to the named files
(under `./app/`) and re-run the failed capability. Use the granular steps below when
iterating or when a step fails.

## Contract

- Each `./forge` command prints **one line of compact JSON**. Parse it.
- **Success is `status == "succeeded"` — NOT the exit code.** `build`/`test`/`lint` exit `0`
  even when the work failed; the failure is a Resource. A `{"error":{...}}` payload +
  non-zero exit is a *platform* error (API down, bad input, policy block).
- Only `--platform web --framework nextjs` is implemented. Anything else returns
  `policy_blocked` — stop, don't retry.
- The app name is `kebab-case` (`^[a-z0-9][a-z0-9-]*$`). The app scaffolds into **`./app`**.

## 0. Preconditions (once per session)

```bash
make up                                    # starts the Forge platform (idempotent)
```

If a `./forge` call reports it can't reach the API, run `make up` again.

## 1. Happy path — substitute APP, run in order

```bash
APP=my-app   # ask the human for a name if not given; else derive a kebab-case one

./forge init app --name "$APP" --platform web --framework nextjs   # scaffolds ./app
./forge provision --app "$APP"     # add --with-postgres and/or --with-redis ONLY if persistence is needed
./forge install --app "$APP"
./forge build   --app "$APP"
./forge test    --app "$APP"
./forge lint    --app "$APP"
```

Apply the **step gate** after each command.

> **⚠️ `provision` is declarative-from-flags, not additive.** It **regenerates** `app/compose.yaml`
> from *only* the flags on that invocation, silently **dropping** any service you don't re-specify.
> So **every re-provision must re-pass the app's full infra set** (e.g. `--with-postgres`, each
> `--secret <NAME>`) — a flag-less re-provision loses Postgres/Redis/secrets. It also resets any
> hand-applied host-port remap (e.g. `5433:5432`), which must be re-applied afterward. When unsure
> what the app already has, run `./forge inspect docker --app "$APP"` **before** re-provisioning,
> then provision with all of it.

## 2. Step gate (after EVERY command)

1. Output is `{"error":{...}}`? Read `.error.retry`:
   - `change-input` → fix the arguments, retry once.
   - `needs-human` → **stop and report** (policy block or Docker unavailable). Do not loop.
   - `retry` → retry the same command once.
2. Else read `.status`:
   - `succeeded` / `provisioned` / `running` → next step.
   - `failed` → capture `.resource` and go to **Diagnose**. Do not continue the happy path.

## 3. Diagnose a failure (instead of reading logs)

```bash
./forge explain --resource <RESOURCE_ID>
```

Returns `{"likely_cause":"…","file_refs":["app/x.tsx:12"],"suggested_actions":["…"]}`.
Edit ONLY the files in `file_refs` (they are `path:line`, under `./app/`), then re-run the
failed capability and re-apply the step gate.

**Escalation cap: 3 fix→re-run attempts on the same capability.** If still failing, get full
context ONCE (`./forge logs <RESOURCE_ID> --full`), summarize it, and report to the human.
Never paste full logs.

## 4. Inspect instead of reading files (token discipline)

```bash
./forge inspect app     --app "$APP"   # summary + resource counts (+ repo_path, now ./app)
./forge inspect routes  --app "$APP"   # route table
./forge inspect scripts --app "$APP"   # npm scripts
./forge inspect docker  --app "$APP"   # provisioned services
./forge inspect events  --app "$APP"   # recent facts
```

Never `cat` app source to check state. Never call `docker`/`npm` directly. Never use `--raw`
unless the human asked for a full Resource; use `--summary` only for human-facing output.

## 5. Run it & verify

```bash
./forge dev --app "$APP"                                   # start dev server (Docker)
curl --retry 20 --retry-all-errors -sf http://localhost:3000/api/health   # wait for health
./forge dev --app "$APP" --stop                            # free the port when done
```

Green build/test/lint is necessary but **not sufficient** — exercise the actual behavior
(hit the routes, and if data must persist, restart the dev server and confirm it survives).
The `add-a-feature` skill's step 5 covers end-to-end verification in full.

## 6. Goal → plan first (optional)

If given a feature Goal rather than "make the app":

```bash
./forge plan --app "$APP" --goal "Add projects and tasks tracking"
```

Execute the returned `validation_steps` (they are `./forge` commands) after you edit files.

## Definition of done

Report success only when: `init`/`provision`/`install` succeeded, `build.status=="succeeded"`,
`test.status=="succeeded"` with `failed==0`, and `lint.status=="succeeded"` with `problems==0`.
Emit a one-line summary with the `build_…`, `test_…`, `check_…` ids and stop. Do not do
unrequested work.

## Known failure signatures & gotchas

| `likely_cause` / symptom | Fix |
|---|---|
| `Cannot find module 'next'` / `Dependencies are not installed` | Run `./forge install --app "$APP"`, then rebuild. |
| `prerender error … NODE_ENV=development` | Re-provision to regenerate compose, then rebuild — but **re-pass every infra flag the app already uses** (e.g. `./forge provision --app "$APP" --with-postgres --secret <NAME>`). A flag-less re-provision **drops** those services (see the ⚠️ under §1). |
| `TypeScript type error` | Edit the file in `file_refs` (under `./app/`), fix the type, rebuild. |
| `Lint reported problems` | Edit the file in `file_refs`, then `./forge lint --app "$APP"`. |
| `Unsupported platform/framework` | Only `web`/`nextjs` exists. Stop and report. |
| Adding an npm dependency | Edit `app/package.json`, then `./forge install` — never `npm` on the host. |
| A DB-backed page fails to build (tries to connect while prerendering) | Mark the page `export const dynamic = 'force-dynamic'`. |
| `./forge dev` fails: port `5432` already allocated | Another project holds Postgres's host port. The app uses `postgres:5432` internally — remap only the **host** port in `app/compose.yaml` (e.g. `5433:5432`); don't touch the other project. (Re-provision resets this — re-apply it.) |
| Re-provision dropped Postgres/Redis/secrets, or reset a host-port remap | `provision` regenerates compose from the flags you pass, not additively. Re-pass **all** infra flags (`--with-postgres`, each `--secret <NAME>`) and re-apply any host-port remap. `./forge inspect docker --app "$APP"` shows what's currently provisioned. |
| Host editor shows "cannot find module" for `next`/`react`/`@/…` | False positive — `node_modules` is in the Docker volume, not on the host. Trust `./forge build`/`lint`. |
