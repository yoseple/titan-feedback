# Titan — Working Agreement (READ FIRST)

Titan is a mobile-first fitness/diet **PWA** (React 19 + Vite + Firebase: Auth/Firestore/Functions, Gemini AI coach). Firebase project: `titan-73b02`.

## 🧠 The Brain is permanent — keep it live (STANDING OWNER RULE)

Titan has a persistent "brain" — an Obsidian knowledge base that is the source of truth for where the project stands. It lives in the **master vault**, NOT in this repo:

```
C:\Users\yosep\AI-Software-Factory\00-Obsidian-Vault\07-Build-Tickets\Titan\
```

Notes: `Resume Here.md` (▶ OPEN FIRST — current state + next actions), `Titan Dashboard.md` (hub), `Titan Facts.md` (architecture ground-truth), `Bug Register.md`, `Improvement Roadmap.md`, `Build Log.md` (append-only, one entry per commit/phase, newest on top), `Decisions & Plan.md`, `Owner Setup (Firebase-Google).md` (console/deploy runbook).

**NON-NEGOTIABLE — update the brain after EVERY change.** The owner has made this permanent: any change we make to Titan (every commit, every phase, every deploy, every decision) MUST be written back to the brain **before the turn ends** so we can always resume exactly where we left off. Do not treat a task as done until the brain reflects it.

On any Titan change, update:
1. **`Build Log.md`** — append a `### <hash> — <title>` entry per commit and a `## PHASE …` entry per phase (newest on top).
2. **`Resume Here.md`** — refresh "Where things stand" + "Next actions" + the repo HEAD/branch line.
3. **`Titan Dashboard.md`** — mirror the status line.
4. **`Bug Register.md`** — update fix status when bugs change.
5. Touch `Titan Facts.md` / `Improvement Roadmap.md` / `Owner Setup` / `Decisions & Plan` when the underlying facts, plan, or console steps change.

At the **start** of any Titan session, read `Resume Here.md` first.

## 🛠️ How we work (owner instructions)

- **Use agents/subagents heavily** — parallel multi-agent workflows for audits, reviews, and builds.
- Keep all Titan brain notes together under `07-Build-Tickets/Titan/` in the master vault (mirrors TintCore). Never scatter them or spin up a separate Titan vault.

## Repo quick facts

- Test: `npm test` (Vitest — pure domain math in `src/domain/`). Build: `npm run build`. Lint: `npm run lint` (non-blocking; CI gates on test + build).
- Domain logic is pure + tested in `src/domain/{foodMath,nutritionMath,coach,foodSearch,trends}.js`; flows in `src/hooks/`.
- Cloud Functions (`functions/index.js`): `generateAI`, `submitTicket`, `searchFood` (callables) + `aggregateDailyFood` (Firestore trigger).
- Deploy/console steps (billing, secrets, Google sign-in, App Check) are owner-side — see `Owner Setup (Firebase-Google).md` in the brain.
