---
name: provision-app
description: Create and validate a Dockerized web app (or a feature in one) through the Forge platform in this workspace. Use whenever the human asks to build/scaffold/create an app or add a feature and wants it actually initialized, installed, built, tested, and linted. Everything runs in Docker via ./forge.
---

# Provision an app with Forge

You are executing a procedure. Run the commands, parse the one-line JSON each prints, and branch on `status`. Do not read app source or dump logs unless a step says to.

## Fast path (prefer this for "just make an app")

```bash
./new-app <kebab-name> [--with-postgres] [--with-redis] [--dev]
```

`new-app` runs the entire procedure below (init → provision → install → build → test → lint), applies the step gate, auto-diagnoses failures, and prints a done summary. If it exits non-zero it prints a diagnosis (cause + files + fix) — apply the fix to the named files and re-run the failed capability. Use the granular steps below when iterating or when a step fails.

## Contract

- Each `./forge` command prints **one line of compact JSON**. Parse it.
- **Success is `status == "succeeded"` — NOT the exit code.** `build`/`test`/`lint` exit `0` even when the work failed; the failure is a Resource. A `{"error":{...}}` payload + non-zero exit is a *platform* error (API down, bad input, policy block).
- Only `--platform web --framework nextjs` is implemented. Anything else returns `policy_blocked` — stop, don't retry.
- App names are `kebab-case` (`^[a-z0-9][a-z0-9-]*$`). Apps scaffold into `./apps/<name>/`.

## 0. Preconditions (once per session)

```bash
make up                                    # starts the Forge platform (idempotent)
```

If a `./forge` call reports it can't reach the API, run `make up` again.

## 1. Happy path — substitute APP, run in order

```bash
APP=my-app   # ask the human for a name if not given; else derive a kebab-case one

./forge init app --name "$APP" --platform web --framework nextjs
./forge provision --app "$APP"     # add --with-postgres and/or --with-redis ONLY if persistence is needed
./forge install --app "$APP"
./forge build   --app "$APP"
./forge test    --app "$APP"
./forge lint    --app "$APP"
```

Apply the **step gate** after each command.

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
Edit ONLY the files in `file_refs` (they are `path:line`, under `apps/<name>/`), then re-run the failed capability and re-apply the step gate.

**Escalation cap: 3 fix→re-run attempts on the same capability.** If still failing, get full context ONCE (`./forge logs <RESOURCE_ID> --full`), summarize it, and report to the human. Never paste full logs.

## 4. Inspect instead of reading files (token discipline)

```bash
./forge inspect app     --app "$APP"   # summary + resource counts
./forge inspect routes  --app "$APP"   # route table
./forge inspect scripts --app "$APP"   # npm scripts
./forge inspect docker  --app "$APP"   # provisioned services
./forge inspect events  --app "$APP"   # recent facts
```

Never `cat` app source to check state. Never call `docker`/`npm` directly. Never use `--raw` unless the human asked for a full Resource; use `--summary` only for human-facing output.

## 5. Run it (optional)

```bash
./forge dev --app "$APP"                                   # start dev server (Docker)
until curl -sf http://localhost:3000/api/health; do sleep 2; done
./forge dev --app "$APP" --stop                            # free the port when done
```

## 6. Goal → plan first (optional)

If given a feature Goal rather than "make an app":

```bash
./forge plan --app "$APP" --goal "Add projects and tasks tracking"
```

Execute the returned `validation_steps` (they are `./forge` commands) after you edit files.

## Definition of done

Report success only when: `init`/`provision`/`install` succeeded, `build.status=="succeeded"`, `test.status=="succeeded"` with `failed==0`, and `lint.status=="succeeded"` with `problems==0`. Emit a one-line summary with the `build_…`, `test_…`, `check_…` ids and stop. Do not do unrequested work.

## Known failure signatures

| `likely_cause` contains | Fix |
|---|---|
| `Cannot find module 'next'` / `Dependencies are not installed` | Run `./forge install --app "$APP"`, then rebuild. |
| `prerender error … NODE_ENV=development` | Re-run `./forge provision --app "$APP"` to regenerate compose, then rebuild. |
| `TypeScript type error` | Edit the file in `file_refs`, fix the type, rebuild. |
| `Lint reported problems` | Edit the file in `file_refs`, then `./forge lint --app "$APP"`. |
| `Unsupported platform/framework` | Only `web`/`nextjs` exists. Stop and report. |
