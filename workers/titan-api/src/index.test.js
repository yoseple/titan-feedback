import { describe, it, expect, vi, beforeEach } from "vitest";
import { dayKey, usageKey } from "./quota.js";

// Mock the network-touching modules so the router can be tested offline.
vi.mock("./auth.js", () => ({
  verifyFirebaseToken: vi.fn(async (token) => {
    if (token === "good") return { uid: "user1", email: "u@e.com" };
    throw new Error("bad token");
  }),
}));
vi.mock("./gemini.js", () => ({
  callGemini: vi.fn(async (prompt) => {
    if (prompt === "fail") throw new Error("gemini down");
    return '{"ok":true}';
  }),
}));
vi.mock("./github.js", () => ({
  fileIssue: vi.fn(async ({ ticketId, type, subject }) => {
    if (subject === "gh-fail") throw new Error("github down");
    return { url: `https://github.com/yoseple/titan-feedback/issues/1?t=${ticketId}&type=${type}` };
  }),
}));
vi.mock("./food.js", () => ({
  handleFood: vi.fn(async (body) => ({ results: [{ id: `stub_${body?.mode || "search"}` }] })),
}));

import worker from "./index.js";

const ALLOWED = "https://titan-73b02.web.app,http://localhost:5173";

function makeKV() {
  const store = new Map();
  return {
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async put(k, v) {
      store.set(k, v);
    },
    _store: store,
  };
}

function makeEnv() {
  return {
    ALLOWED_ORIGINS: ALLOWED,
    FIREBASE_PROJECT_ID: "titan-73b02",
    GEMINI_API_KEY: "gk",
    GITHUB_TOKEN: "gt",
    USDA_API_KEY: "uk",
    TITAN_KV: makeKV(),
  };
}

function req(method, path, { body, auth, origin } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`https://titan-api.workers.dev${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

let env;
beforeEach(() => {
  env = makeEnv();
});

describe("GET /health", () => {
  it("returns 200 ok without auth", async () => {
    const res = await worker.fetch(req("GET", "/health"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "titan-api" });
  });
});

describe("OPTIONS preflight", () => {
  it("returns 204 and reflects an allowed origin", async () => {
    const res = await worker.fetch(req("OPTIONS", "/ai", { origin: "http://localhost:5173" }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("omits allow-origin for a disallowed origin", async () => {
    const res = await worker.fetch(req("OPTIONS", "/ai", { origin: "https://evil.com" }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("auth gate", () => {
  it("401 when no Authorization header", async () => {
    const res = await worker.fetch(req("POST", "/ai", { body: { prompt: "hi" } }), env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("401 when token is invalid", async () => {
    const res = await worker.fetch(req("POST", "/ai", { body: { prompt: "hi" }, auth: "bad" }), env);
    expect(res.status).toBe(401);
  });
});

describe("POST /ai", () => {
  it("400 on missing/oversized prompt", async () => {
    const empty = await worker.fetch(req("POST", "/ai", { body: {}, auth: "good" }), env);
    expect(empty.status).toBe(400);
    const big = await worker.fetch(
      req("POST", "/ai", { body: { prompt: "x".repeat(8001) }, auth: "good" }),
      env
    );
    expect(big.status).toBe(400);
  });

  it("200 with text + remaining, and charges quota", async () => {
    const res = await worker.fetch(req("POST", "/ai", { body: { prompt: "hello" }, auth: "good" }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: '{"ok":true}', remaining: 29 }); // chat limit 30 - 1
    const stored = env.TITAN_KV._store.get(usageKey("user1", dayKey()));
    expect(JSON.parse(stored)).toEqual({ chat: 1, search: 0 });
  });

  it("uses the search limit for type=search", async () => {
    const res = await worker.fetch(
      req("POST", "/ai", { body: { prompt: "hello", type: "search" }, auth: "good" }),
      env
    );
    expect((await res.json()).remaining).toBe(149); // search limit 150 - 1
  });

  it("429 when already at the daily limit (no quota change)", async () => {
    env.TITAN_KV._store.set(usageKey("user1", dayKey()), JSON.stringify({ chat: 30, search: 0 }));
    const res = await worker.fetch(req("POST", "/ai", { body: { prompt: "hello" }, auth: "good" }), env);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "resource-exhausted", remaining: 0 });
  });

  it("502 on Gemini failure and does NOT charge quota", async () => {
    const res = await worker.fetch(req("POST", "/ai", { body: { prompt: "fail" }, auth: "good" }), env);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "ai_failed" });
    expect(env.TITAN_KV._store.has(usageKey("user1", dayKey()))).toBe(false);
  });
});

describe("POST /food", () => {
  it("200 with results", async () => {
    const res = await worker.fetch(
      req("POST", "/food", { body: { mode: "search", query: "egg" }, auth: "good" }),
      env
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [{ id: "stub_search" }] });
  });
});

describe("POST /ticket", () => {
  it("400 when subject or message missing", async () => {
    const res = await worker.fetch(
      req("POST", "/ticket", { body: { subject: "only subject" }, auth: "good" }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("200 with success/url/ticketId and stores PII in KV (not the issue)", async () => {
    const res = await worker.fetch(
      req("POST", "/ticket", {
        body: { subject: "Broken", message: "It crashed", type: "bug" },
        auth: "good",
      }),
      env
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.ticketId).toBe("string");
    expect(data.url).toContain("github.com");

    const record = JSON.parse(env.TITAN_KV._store.get(`ticket:${data.ticketId}`));
    expect(record).toMatchObject({ uid: "user1", email: "u@e.com", subject: "Broken", type: "bug" });
  });

  it("502 when GitHub filing fails (ticket still saved in KV)", async () => {
    const res = await worker.fetch(
      req("POST", "/ticket", { body: { subject: "gh-fail", message: "x" }, auth: "good" }),
      env
    );
    expect(res.status).toBe(502);
    // A ticket:* record was still written.
    const keys = [...env.TITAN_KV._store.keys()].filter((k) => k.startsWith("ticket:"));
    expect(keys.length).toBe(1);
  });
});

describe("unknown routes", () => {
  it("404 for unknown POST path", async () => {
    const res = await worker.fetch(req("POST", "/nope", { body: {}, auth: "good" }), env);
    expect(res.status).toBe(404);
  });
  it("404 for non-POST non-health method", async () => {
    const res = await worker.fetch(req("GET", "/ai"), env);
    expect(res.status).toBe(404);
  });
});
