// Titan API — Cloudflare Worker. Replaces the 3 Firebase callables (generateAI,
// searchFood, submitTicket) so the app runs card-free. See ../CONTRACT.md.

import { corsHeaders, preflightResponse } from "./cors.js";
import { verifyFirebaseToken } from "./auth.js";
import { callGemini } from "./gemini.js";
import { handleFood } from "./food.js";
import { fileIssue } from "./github.js";
import {
  dayKey,
  readUsage,
  writeUsage,
  nextUsage,
  isOverLimit,
  remainingFor,
} from "./quota.js";

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

// Lightweight per-uid/day counter for the non-AI routes (food/ticket). Kept separate
// from the AI quota accounting (quota.js) so it doesn't perturb that tested shape.
// Non-atomic read-modify-write (last-write-wins), acceptable as an abuse ceiling — it
// stops a single authenticated account from exhausting the shared USDA key or spamming
// GitHub issues / unbounded KV. Returns true if the call is allowed (and charges it).
async function underDailyLimit(kv, prefix, uid, limit) {
  const key = `${prefix}:${uid}:${dayKey()}`;
  const raw = await kv.get(key);
  const n = raw ? parseInt(raw, 10) || 0 : 0;
  if (n >= limit) return false;
  await kv.put(key, String(n + 1), { expirationTtl: 60 * 60 * 48 });
  return true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);
    const { pathname } = new URL(request.url);

    // CORS preflight.
    if (request.method === "OPTIONS") {
      return preflightResponse(origin, env.ALLOWED_ORIGINS);
    }

    // Public health check (no auth).
    if (pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "titan-api" }, 200, cors);
    }

    // Everything else is a POST route.
    if (request.method !== "POST") {
      return json({ error: "not_found" }, 404, cors);
    }

    // Auth: verify the Firebase ID token for all POST routes.
    let user;
    try {
      const authHeader = request.headers.get("Authorization") || "";
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!match) throw new Error("Missing bearer token");
      user = await verifyFirebaseToken(match[1], env);
    } catch {
      return json({ error: "unauthenticated" }, 401, cors);
    }

    // Parse body (tolerate empty/invalid — handlers validate their own fields).
    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    // Dispatch. Any unexpected throw becomes a JSON 500, never a bare crash.
    try {
      if (pathname === "/ai") return await handleAi(body, env, user, cors);
      if (pathname === "/food") return await handleFoodRoute(body, env, user, cors);
      if (pathname === "/ticket") return await handleTicket(body, env, user, cors);
      return json({ error: "not_found" }, 404, cors);
    } catch {
      return json({ error: "internal" }, 500, cors);
    }
  },
};

// POST /ai
async function handleAi(body, env, user, cors) {
  const prompt = body?.prompt;
  const type = body?.type === "search" ? "search" : "chat";

  if (typeof prompt !== "string" || prompt.length < 1 || prompt.length > 8000) {
    return json({ error: "invalid-argument" }, 400, cors);
  }

  const day = dayKey();
  const usage = await readUsage(env.TITAN_KV, user.uid, day);
  const used = type === "chat" ? usage.chat : usage.search;

  // Pre-check quota so we don't spend a Gemini call when clearly over.
  if (isOverLimit(used, type)) {
    return json({ error: "resource-exhausted", remaining: 0 }, 429, cors);
  }

  let text;
  try {
    text = await callGemini(prompt, env.GEMINI_API_KEY);
  } catch {
    // Generation failed — do NOT charge quota.
    return json({ error: "ai_failed" }, 502, cors);
  }

  // Charge quota only after a successful generation.
  const updated = nextUsage(usage, type);
  await writeUsage(env.TITAN_KV, user.uid, day, updated);
  const remaining = remainingFor(type === "chat" ? updated.chat : updated.search, type);

  return json({ text, remaining }, 200, cors);
}

// POST /food
async function handleFoodRoute(body, env, user, cors) {
  // Bound how many uncached upstream (USDA/OFF) calls one account can make per day so a
  // single user can't exhaust the shared USDA key and degrade search for everyone.
  if (!(await underDailyLimit(env.TITAN_KV, "frate", user.uid, 300))) {
    return json({ error: "resource-exhausted", results: [] }, 429, cors);
  }
  const result = await handleFood(body, env);
  return json(result, 200, cors);
}

// POST /ticket
async function handleTicket(body, env, user, cors) {
  const subject = String(body?.subject || "").slice(0, 200);
  const message = String(body?.message || "").slice(0, 5000);
  const type = ["bug", "feedback"].includes(body?.type) ? body.type : "feedback";
  if (!subject || !message) return json({ error: "invalid-argument" }, 400, cors);

  // Cap tickets/day/account so a single user can't spam public GitHub issues (tripping
  // the token's secondary rate limit) or accumulate unbounded KV records.
  if (!(await underDailyLimit(env.TITAN_KV, "trate", user.uid, 20))) {
    return json({ error: "resource-exhausted" }, 429, cors);
  }

  // Store PII mapping privately in KV; keep it OUT of the public GitHub issue. Expire the
  // record after 90 days so ticket:* keys don't accumulate forever.
  const ticketId = crypto.randomUUID();
  const record = {
    uid: user.uid,
    email: user.email || "unknown",
    subject,
    message,
    type,
    createdAt: new Date().toISOString(),
  };
  await env.TITAN_KV.put(`ticket:${ticketId}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 90 });

  try {
    const { url } = await fileIssue({ subject, message, type, ticketId, token: env.GITHUB_TOKEN });
    return json({ success: true, url, ticketId }, 200, cors);
  } catch {
    // Ticket already persisted in KV even if GitHub filing failed.
    return json({ error: "ticket_failed" }, 502, cors);
  }
}
