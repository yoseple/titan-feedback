# Titan API — Cloudflare Workers migration contract (SINGLE SOURCE OF TRUTH)

Ports the 3 Firebase callables (`generateAI`, `searchFood`, `submitTicket`) to one Cloudflare Worker so
the app runs **card-free** (Firebase stays on Spark for Auth + Firestore + Hosting; the Worker replaces
Cloud Functions). `aggregateDailyFood` (a Firestore trigger) is **dropped** — nothing reads `daily_summaries`.

The Worker needs **no Firestore access**: quota → KV, ticket PII mapping → KV, `food_cache` write dropped.

## Transport & CORS
- Base URL (prod): `https://titan-api.<account>.workers.dev`; exposed to the web app as `VITE_WORKER_URL`.
- POST routes require headers: `Content-Type: application/json` and `Authorization: Bearer <Firebase ID token>`.
- CORS: reflect origin if in `ALLOWED_ORIGINS` (comma-separated var). Handle `OPTIONS` preflight (204).
  Allow methods `POST, OPTIONS`; allow headers `Content-Type, Authorization`. Default allowed origins:
  `https://titan-73b02.web.app, https://titan-73b02.firebaseapp.com, http://localhost:5173`.

## Auth — verify Firebase ID token (RS256)
- Extract bearer token; verify JWT signature with Web Crypto (`RS256`).
- Fetch signing certs from `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`
  (map of `kid -> x509 PEM`). Cache in KV honoring the response `Cache-Control: max-age` (`certs:securetoken` key).
- Validate claims: `iss === https://securetoken.google.com/<FIREBASE_PROJECT_ID>`, `aud === <FIREBASE_PROJECT_ID>`,
  `exp > now`, `iat <= now`, `sub` non-empty. Return `{ uid: sub, email: token.email }`.
- Any failure ⇒ HTTP 401 JSON `{ error: "unauthenticated" }`. Never trust an unverified uid.

## Routes
### `GET /health` (no auth)
200 `{ ok: true, service: "titan-api" }`. For uptime/negative-auth checks.

### `POST /ai`  (auth required)
- Body: `{ prompt: string (1..8000 chars), type: "chat" | "search" }` (default type "chat").
- Quota (KV, per uid, per UTC day). Key `usage:{uid}:{YYYY-MM-DD}` → JSON `{ chat, search }`.
  Limits: chat **30**, search **150**. Pre-check before calling Gemini; if `used >= limit` ⇒ HTTP 429
  `{ error: "resource-exhausted", remaining: 0 }`. Charge quota (increment) **only after** a successful generation.
- Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=<GEMINI_API_KEY>`
  body `{ contents:[{parts:[{text:prompt}]}], generationConfig:{ responseMimeType:"application/json", temperature:0.7, maxOutputTokens:2048 } }`.
  Non-OK or empty `candidates[0].content.parts[0].text` ⇒ HTTP 502 `{ error: "ai_failed" }` and **do NOT** charge quota.
- Success ⇒ 200 `{ text: <string>, remaining: <number> }`.  (Client parses `text` as JSON itself.)

### `POST /food`  (auth required)
- Body: `{ mode: "search" | "barcode", query?: string, barcode?: string }` (default mode "search").
- Port the exact normalization from `functions/index.js` (`searchUsdaServer`, `searchOffServer`,
  `barcodeLookupServer`, `categorizeFoodServer`, `gramsFromServingSize`) — per-100g base, kcal (kJ/4.184
  fallback), `servingGrams`, `weight_amount:"100g"`, id prefixes `usda_`/`off_`, source labels.
- search: run USDA (`USDA_API_KEY`) + OpenFoodFacts in parallel, each `.catch(()=>[])`; merge `[...usda, ...off]`.
  `query.trim()` length < 2 ⇒ `{ results: [] }`.
- barcode: OFF product lookup; `{ results: product ? [product] : [] }`.
- Response: `{ results: [...] }`. **Do not** write `food_cache` (no Firestore).

### `POST /ticket`  (auth required)
- Body: `{ subject: string (1..200), message: string (1..5000), type: "bug" | "feedback" }`. Missing subject/message ⇒ 400.
- `ticketId = crypto.randomUUID()`. Store PII mapping in KV `ticket:{ticketId}` →
  `{ uid, email, subject, message, type, createdAt: <ISO> }`. **Keep PII out of the GitHub issue.**
- File issue: `POST https://api.github.com/repos/yoseple/titan-feedback/issues` with `Authorization: token <GITHUB_TOKEN>`,
  `User-Agent: TitanApp`, title `[TYPE] subject`, body includes the message + only the `ticketId` (no email/uid), `labels:[type]`.
- Success ⇒ `{ success: true, url: <issue html_url>, ticketId }`. GitHub failure ⇒ 502 (ticket already saved in KV).

## Bindings / env (wrangler.toml + secrets)
- KV binding: `TITAN_KV`.
- Vars: `FIREBASE_PROJECT_ID = "titan-73b02"`, `ALLOWED_ORIGINS = "https://titan-73b02.web.app,https://titan-73b02.firebaseapp.com,http://localhost:5173"`.
- Secrets (set via `wrangler secret put`): `GEMINI_API_KEY`, `USDA_API_KEY`, `GITHUB_TOKEN`.

## Client parity (the web app depends on these EXACT response shapes)
- `/ai` → `{ text, remaining }`  (used by `src/lib/ai.js`; it JSON-parses `text`, records `remaining` in `aiQuota`).
- `/food` → `{ results }`  (used by `src/utils/nutrition.js`).
- `/ticket` → `{ success, url, ticketId }`  (used by `src/services/userService.js`).
- Errors: JSON `{ error }` + status. The client maps HTTP 429 → a thrown `resource-exhausted` error.

## Testing (required — each half ships green)
- Worker: Vitest unit tests for all pure logic (food mappers/energy/servingGrams/categorize, quota inc/limit,
  JWT claim validation with a crafted token, CORS origin decision, request validation). Run to green.
- Client: existing `npm test` (50 tests) stays green; `npm run build` succeeds with the rewired call sites.
