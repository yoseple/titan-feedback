// src/lib/workerClient.js
// Thin HTTP client for the Titan Cloudflare Worker API. Replaces the Firebase
// Cloud Functions callables — the Worker returns PLAIN JSON (no {data}/{result}
// envelope), authenticated with a Firebase ID token in the Authorization header.
import { auth } from "./firebase";

const BASE = import.meta.env.VITE_WORKER_URL;

// True once VITE_WORKER_URL is set at build time. Callers can degrade gracefully
// (empty results / null) when the worker isn't wired up yet.
export function workerConfigured() {
  return !!BASE;
}

/**
 * POST `body` to the worker at `path` and return the parsed JSON payload directly.
 * Throws an Error with a `.code`:
 *   - 'not_configured'      when VITE_WORKER_URL is unset
 *   - 'unauthenticated'     when there is no signed-in Firebase user
 *   - 'resource-exhausted'  on HTTP 429
 *   - parsedBody.error || String(res.status)  on other non-2xx responses
 */
export async function callWorker(path, body) {
  if (!BASE) {
    const err = new Error("Worker not configured: set VITE_WORKER_URL before build.");
    err.code = "not_configured";
    throw err;
  }

  const user = auth.currentUser;
  if (!user) {
    const err = new Error("Not signed in: a Firebase ID token is required to call the worker.");
    err.code = "unauthenticated";
    throw err;
  }

  const token = await user.getIdToken();

  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  // The worker always responds with JSON (success payload or { error }).
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const code =
      res.status === 429
        ? "resource-exhausted"
        : (parsed && parsed.error) || String(res.status);
    const err = new Error(`Worker request to ${path} failed (${code}).`);
    err.code = code;
    throw err;
  }

  return parsed;
}
