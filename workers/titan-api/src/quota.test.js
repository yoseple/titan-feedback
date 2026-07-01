import { describe, it, expect } from "vitest";
import {
  LIMITS,
  limitFor,
  dayKey,
  usageKey,
  nextUsage,
  isOverLimit,
  remainingFor,
  readUsage,
  writeUsage,
} from "./quota.js";

describe("limits", () => {
  it("chat=30, search=150", () => {
    expect(LIMITS).toEqual({ chat: 30, search: 150 });
    expect(limitFor("chat")).toBe(30);
    expect(limitFor("search")).toBe(150);
    expect(limitFor("anything-else")).toBe(30); // defaults to chat
  });
});

describe("dayKey / usageKey", () => {
  it("formats a UTC day key", () => {
    expect(dayKey(new Date("2026-07-01T23:59:59Z"))).toBe("2026-07-01");
  });
  it("builds a per-uid per-day key", () => {
    expect(usageKey("abc", "2026-07-01")).toBe("usage:abc:2026-07-01");
  });
});

describe("nextUsage increment", () => {
  it("increments chat only", () => {
    expect(nextUsage({ chat: 2, search: 5 }, "chat")).toEqual({ chat: 3, search: 5 });
  });
  it("increments search only", () => {
    expect(nextUsage({ chat: 2, search: 5 }, "search")).toEqual({ chat: 2, search: 6 });
  });
  it("treats missing current as zeros", () => {
    expect(nextUsage(undefined, "chat")).toEqual({ chat: 1, search: 0 });
    expect(nextUsage({}, "search")).toEqual({ chat: 0, search: 1 });
  });
});

describe("isOverLimit boundaries", () => {
  it("chat under/at/over limit", () => {
    expect(isOverLimit(29, "chat")).toBe(false);
    expect(isOverLimit(30, "chat")).toBe(true); // at limit blocks the 31st
    expect(isOverLimit(31, "chat")).toBe(true);
  });
  it("search under/at/over limit", () => {
    expect(isOverLimit(149, "search")).toBe(false);
    expect(isOverLimit(150, "search")).toBe(true);
  });
});

describe("remainingFor", () => {
  it("computes remaining and never goes negative", () => {
    expect(remainingFor(1, "chat")).toBe(29);
    expect(remainingFor(30, "chat")).toBe(0);
    expect(remainingFor(999, "chat")).toBe(0);
    expect(remainingFor(1, "search")).toBe(149);
  });
});

// KV wrappers against a Map-backed fake.
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

describe("readUsage / writeUsage KV wrappers", () => {
  it("reads zeros when absent", async () => {
    const kv = makeKV();
    expect(await readUsage(kv, "u1", "2026-07-01")).toEqual({ chat: 0, search: 0 });
  });

  it("round-trips written usage under the daily key", async () => {
    const kv = makeKV();
    await writeUsage(kv, "u1", "2026-07-01", { chat: 4, search: 9 });
    expect(kv._store.has("usage:u1:2026-07-01")).toBe(true);
    expect(await readUsage(kv, "u1", "2026-07-01")).toEqual({ chat: 4, search: 9 });
  });

  it("isolates different days (daily reset)", async () => {
    const kv = makeKV();
    await writeUsage(kv, "u1", "2026-07-01", { chat: 30, search: 0 });
    expect(await readUsage(kv, "u1", "2026-07-02")).toEqual({ chat: 0, search: 0 });
  });
});
