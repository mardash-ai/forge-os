# Moved — the wind-tunnel ledger now lives in the `mardash` orchestrator

The platform-capabilities ledger (the contract that used to live here) has moved to the neutral
orchestrator repo:

> **`../mardash/PLATFORM_CAPABILITIES.md`**

## What changed

The **mardash orchestrator** now drives the build/adopt relay and is the **sole writer** of the
ledger. The manual write-baton is retired.

**As the forge-os agent, you no longer read or write this ledger directly.** You receive adoption
tasks from the orchestrator — a *relay prompt* (a contract slice: the capability's HTTP/CLI
signature, the pinned image, verify steps, what refactors out). You adopt it in **this repo only**
and return a **structured result**; the orchestrator records it in the ledger.

## Isolation (strict zero-bleed)

You are scoped to **forge-os**. Do **not** read or write any sibling mardash project (`../forge`,
`../forge-starter`) — code *or* docs. Everything you need is in the task prompt the orchestrator
hands you. See `../mardash/CLAUDE.md`.

*(This file's historical content is in git history and mirrored, canonical, in `../mardash`.)*
