# Titan — Working Agreement (READ FIRST)

Titan is a mobile-first fitness/diet **PWA** (React 19 + Vite + Firebase: Auth/Firestore/Functions, Gemini AI coach). Firebase project: `titan-73b02`.

## 🧠 The Brain is permanent — keep it live (STANDING OWNER RULE)

Titan has a persistent "brain" — an Obsidian knowledge base that is the source of truth for where the project stands. It lives in the **master vault**, NOT in this repo:

```
C:\Users\yosep\AI-Software-Factory\00-Obsidian-Vault\07-Build-Tickets\Titan\
```

Notes: `Resume Here.md` (▶ OPEN FIRST — current state + next actions), `Titan Dashboard.md` (hub), `Titan Facts.md` (architecture ground-truth), `Bug Register.md`, `Improvement Roadmap.md`, `Build Log.md` (append-only, one entry per commit/phase, newest on top), `Decisions & Plan.md`, `UI-UX Plan.md` (redesign plan), `Owner Setup (Firebase-Google).md` (console/deploy runbook).

**NON-NEGOTIABLE — update the brain after EVERY change.** The owner has made this permanent: any change we make to Titan (every commit, every phase, every deploy, every decision) MUST be written back to the brain **before the turn ends** so we can always resume exactly where we left off. Do not treat a task as done until the brain reflects it. (If the vault path doesn't exist on this machine, e.g. someone else's clone of this public repo, skip this.)

On any Titan change, update:
1. **`Build Log.md`** — append a `### <hash> — <title>` entry per commit and a `## PHASE …` entry per phase (newest on top).
2. **`Resume Here.md`** — refresh "Where things stand" + "Next actions" + the repo HEAD/branch line.
3. **`Titan Dashboard.md`** — mirror the status line.
4. **`Bug Register.md`** — update fix status when bugs change.
5. Touch `Titan Facts.md` / `Improvement Roadmap.md` / `Owner Setup` / `Decisions & Plan` when the underlying facts, plan, or console steps change.

At the **start** of any Titan session, read `Resume Here.md` first.

## Project manager (standing rule)

- Titan's PM is the `project-manager` agent: `.claude/agents/project-manager.md` (tailored from `~/.claude/agents/project-manager.md`).
- It reports to **Joseph (Supervisor)** in the fixed PM REPORT format at the end of every task and whenever he asks for status.
- It owns the board: the vault `07-Build-Tickets\Titan\Task Board.md` (bugs keep their `B##` keys from `Bug Register.md`). Every open task has exactly one owner from the Dashboard's **Team & Roles** section.
- After every task it updates Titan's row in `00-Obsidian-Vault\00-Supervisor\Portfolio Board.md` and adds the report to `00-Supervisor\PM Reports\<YYYY-MM>.md`.

## 🛠️ How we work (owner instructions)

- **Use agents/subagents heavily** — parallel multi-agent workflows for audits, reviews, and builds.
- Keep all Titan brain notes together under `07-Build-Tickets/Titan/` in the master vault (mirrors TintCore). Never scatter them or spin up a separate Titan vault.

## Repo quick facts

- Test: `npm test` (Vitest — pure domain math in `src/domain/`). Build: `npm run build`. Lint: `npm run lint` (non-blocking; CI gates on test + build).
- Domain logic is pure + tested in `src/domain/{foodMath,nutritionMath,coach,foodSearch,trends}.js`; flows in `src/hooks/`.
- Backend: one Cloudflare Worker, `workers/titan-api` (since `28e7bb9`). It handles Firebase ID-token auth, per-user daily quota, food search and barcode lookup, the Gemini AI coach and GitHub feedback tickets. The client calls it through `src/lib/workerClient.js`. Firebase stays on Spark for Auth, Firestore and Hosting. The old `functions/` callables (`generateAI`, `submitTicket`, `searchFood`, `aggregateDailyFood`) are retired.
- Deploy/console steps (billing, secrets, Google sign-in, App Check) are owner-side — see `Owner Setup (Firebase-Google).md` in the brain.
