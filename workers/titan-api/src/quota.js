// Daily per-user quota. Ported limits from functions/index.js (chat 30, search 150).
// Firestore's `user_usage` doc is replaced by a per-UTC-day KV key so each new day
// starts from a fresh key (natural daily reset). NOTE: same-day increments are a
// non-atomic KV read-modify-write, so highly-concurrent /ai calls can under-count
// (last-write-wins) — an accepted tradeoff for a personal app vs the old Firestore txn.

export const LIMITS = { chat: 30, search: 150 };

export function limitFor(type) {
  return type === "search" ? LIMITS.search : LIMITS.chat;
}

// UTC day string, e.g. "2026-07-01" (matches new Date().toISOString().split('T')[0]).
export function dayKey(date = new Date()) {
  return date.toISOString().split("T")[0];
}

// KV key for a user's usage on a given UTC day.
export function usageKey(uid, day) {
  return `usage:${uid}:${day}`;
}

// Pure: given stored usage {chat, search} and the type being charged, return the new usage.
export function nextUsage(current, type) {
  const base = current && typeof current === "object" ? current : {};
  const chat = base.chat || 0;
  const search = base.search || 0;
  return {
    chat: chat + (type === "chat" ? 1 : 0),
    search: search + (type === "search" ? 1 : 0),
  };
}

// Pure: has this type already used up its daily allowance?
export function isOverLimit(used, type) {
  return (used || 0) >= limitFor(type);
}

// Pure: how many of this type remain after `used` uses (never negative).
export function remainingFor(used, type) {
  return Math.max(0, limitFor(type) - (used || 0));
}

// --- KV wrappers (thin, side-effecting) ---------------------------------------

export async function readUsage(kv, uid, day) {
  const raw = await kv.get(usageKey(uid, day));
  if (!raw) return { chat: 0, search: 0 };
  try {
    const parsed = JSON.parse(raw);
    return { chat: parsed.chat || 0, search: parsed.search || 0 };
  } catch {
    return { chat: 0, search: 0 };
  }
}

export async function writeUsage(kv, uid, day, usage) {
  // Expire ~2 days out so stale daily keys don't accumulate in KV.
  await kv.put(usageKey(uid, day), JSON.stringify(usage), { expirationTtl: 60 * 60 * 48 });
}
