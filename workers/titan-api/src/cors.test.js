import { describe, it, expect } from "vitest";
import { corsHeaders, parseAllowedOrigins, preflightResponse } from "./cors.js";

const ALLOWED = "https://titan-73b02.web.app,https://titan-73b02.firebaseapp.com,http://localhost:5173";

describe("parseAllowedOrigins", () => {
  it("splits and trims a comma-separated string", () => {
    expect(parseAllowedOrigins(" a , b ,c ")).toEqual(["a", "b", "c"]);
  });
  it("passes through arrays and drops empties", () => {
    expect(parseAllowedOrigins(["a", "", " b "])).toEqual(["a", "b"]);
  });
  it("handles empty/undefined", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
  });
});

describe("corsHeaders origin decision", () => {
  it("reflects an allowed origin", () => {
    const h = corsHeaders("http://localhost:5173", ALLOWED);
    expect(h["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(h["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(h["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization");
  });

  it("reflects the prod web.app origin", () => {
    const h = corsHeaders("https://titan-73b02.web.app", ALLOWED);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://titan-73b02.web.app");
  });

  it("does NOT set allow-origin for a disallowed origin", () => {
    const h = corsHeaders("https://evil.example.com", ALLOWED);
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("does NOT set allow-origin when origin is missing", () => {
    const h = corsHeaders(null, ALLOWED);
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

describe("preflightResponse", () => {
  it("returns 204 with CORS headers for an allowed origin", () => {
    const res = preflightResponse("http://localhost:5173", ALLOWED);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});
