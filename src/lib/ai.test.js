import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the worker HTTP client so tests never touch Firebase/network.
vi.mock("./workerClient", () => ({
  callWorker: vi.fn(),
}));

import { callWorker } from "./workerClient";
import { generateContent, aiQuota } from "./ai";

describe("generateContent (src/lib/ai.js)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module-level quota cache between tests.
    aiQuota.chat = null;
    aiQuota.search = null;
    // Silence expected console noise from error/warn branches.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("parses a clean JSON string in payload.text", async () => {
    callWorker.mockResolvedValue({ text: '{"reply":"hi","n":3}', remaining: 5 });

    const result = await generateContent("hello");

    expect(result).toEqual({ reply: "hi", n: 3 });
    // Called the /ai route with the prompt + default type.
    expect(callWorker).toHaveBeenCalledWith("/ai", { prompt: "hello", type: "chat" });
  });

  it("strips ```json fences before parsing", async () => {
    callWorker.mockResolvedValue({
      text: '```json\n{"ok":true,"items":[1,2]}\n```',
      remaining: 2,
    });

    const result = await generateContent("give me json");

    expect(result).toEqual({ ok: true, items: [1, 2] });
  });

  it("strips bare ``` fences (no language tag) before parsing", async () => {
    callWorker.mockResolvedValue({ text: '```\n{"a":1}\n```', remaining: 1 });

    const result = await generateContent("code fenced");

    expect(result).toEqual({ a: 1 });
  });

  it("extracts the outer {..} object when wrapped in surrounding prose", async () => {
    callWorker.mockResolvedValue({
      text: 'Sure! Here is your data: {"calories":200,"protein":10} Hope that helps!',
      remaining: 4,
    });

    const result = await generateContent("analyze");

    expect(result).toEqual({ calories: 200, protein: 10 });
  });

  it("sets aiQuota[type] from payload.remaining", async () => {
    callWorker.mockResolvedValue({ text: '{"x":1}', remaining: 7 });

    await generateContent("q", "search");

    expect(aiQuota.search).toBe(7);
    expect(aiQuota.chat).toBeNull();
  });

  it("does not overwrite aiQuota when remaining is not a number", async () => {
    callWorker.mockResolvedValue({ text: '{"x":1}', remaining: "nope" });

    await generateContent("q", "chat");

    expect(aiQuota.chat).toBeNull();
  });

  it("returns null when the extracted content is not valid JSON", async () => {
    callWorker.mockResolvedValue({ text: "this is just prose with no object", remaining: 1 });

    const result = await generateContent("bad");

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns null on empty text", async () => {
    callWorker.mockResolvedValue({ text: "", remaining: 1 });

    const result = await generateContent("empty");

    expect(result).toBeNull();
  });

  it("returns null when payload is a non-string primitive with no text", async () => {
    callWorker.mockResolvedValue({ remaining: 1 });

    const result = await generateContent("no-text");

    expect(result).toBeNull();
  });

  it("tolerates the legacy raw-string payload shape", async () => {
    callWorker.mockResolvedValue('{"legacy":true}');

    const result = await generateContent("legacy");

    expect(result).toEqual({ legacy: true });
  });

  it("throws an Error containing 'limit reached' when callWorker rejects with code resource-exhausted", async () => {
    const err = new Error("Worker request to /ai failed (resource-exhausted).");
    err.code = "resource-exhausted";
    callWorker.mockRejectedValue(err);

    await expect(generateContent("q", "search")).rejects.toThrow(/limit reached/);
    await expect(generateContent("q", "search")).rejects.toThrow(/Daily search limit reached/);
  });

  it("throws 'limit reached' when the error message includes resource-exhausted (no code)", async () => {
    callWorker.mockRejectedValue(new Error("HTTP resource-exhausted from upstream"));

    await expect(generateContent("q")).rejects.toThrow(/limit reached/);
  });

  it("returns null (does not throw) for other worker errors", async () => {
    const err = new Error("boom");
    err.code = "unauthenticated";
    callWorker.mockRejectedValue(err);

    const result = await generateContent("q");

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
