import { describe, it, expect } from "vitest";
import {
  base64UrlEncode,
  base64UrlDecode,
  base64UrlDecodeToString,
  parseJwt,
  validateClaims,
  verifySignature,
  verifyWithKey,
  parseMaxAge,
} from "./auth.js";

const PROJECT = "titan-73b02";
const NOW = 1_800_000_000; // fixed "now" in seconds

function goodPayload(overrides = {}) {
  return {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: "user-123",
    email: "u@example.com",
    iat: NOW - 60,
    exp: NOW + 3600,
    ...overrides,
  };
}

describe("base64url helpers", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
    const enc = base64UrlEncode(bytes);
    expect(enc).not.toMatch(/[+/=]/); // url-safe, no padding
    expect(Array.from(base64UrlDecode(enc))).toEqual(Array.from(bytes));
  });

  it("round-trips strings", () => {
    const s = JSON.stringify({ hello: "wörld", n: 42 });
    expect(base64UrlDecodeToString(base64UrlEncode(s))).toBe(s);
  });

  it("rejects malformed base64url length", () => {
    expect(() => base64UrlDecode("A")).toThrow();
  });
});

describe("parseJwt", () => {
  it("splits header/payload/signature and exposes signingInput", () => {
    const header = { alg: "RS256", kid: "abc" };
    const payload = goodPayload();
    const h = base64UrlEncode(JSON.stringify(header));
    const p = base64UrlEncode(JSON.stringify(payload));
    const sig = base64UrlEncode(new Uint8Array([9, 9, 9]));
    const token = `${h}.${p}.${sig}`;

    const parsed = parseJwt(token);
    expect(parsed.header).toEqual(header);
    expect(parsed.payload).toEqual(payload);
    expect(parsed.signingInput).toBe(`${h}.${p}`);
    expect(Array.from(parsed.signature)).toEqual([9, 9, 9]);
  });

  it("throws on a non-3-part token", () => {
    expect(() => parseJwt("a.b")).toThrow(/Malformed/);
  });
});

describe("validateClaims", () => {
  it("accepts a good token and returns uid+email", () => {
    expect(validateClaims(goodPayload(), PROJECT, NOW)).toEqual({
      uid: "user-123",
      email: "u@example.com",
    });
  });

  it("rejects a wrong audience", () => {
    expect(() => validateClaims(goodPayload({ aud: "someone-else" }), PROJECT, NOW)).toThrow(/audience/);
  });

  it("rejects a wrong issuer", () => {
    expect(() =>
      validateClaims(goodPayload({ iss: "https://securetoken.google.com/evil" }), PROJECT, NOW)
    ).toThrow(/issuer/);
  });

  it("rejects an expired token", () => {
    expect(() => validateClaims(goodPayload({ exp: NOW - 1 }), PROJECT, NOW)).toThrow(/expired/);
  });

  it("rejects a future iat", () => {
    expect(() => validateClaims(goodPayload({ iat: NOW + 100 }), PROJECT, NOW)).toThrow(/future/);
  });

  it("rejects a missing subject", () => {
    expect(() => validateClaims(goodPayload({ sub: "" }), PROJECT, NOW)).toThrow(/subject/);
  });
});

describe("parseMaxAge", () => {
  it("extracts max-age seconds", () => {
    expect(parseMaxAge("public, max-age=19800, must-revalidate")).toBe(19800);
  });
  it("defaults when absent", () => {
    expect(parseMaxAge(null)).toBe(3600);
    expect(parseMaxAge("no-cache")).toBe(3600);
  });
});

// Full RS256 path: generate a real keypair, sign a JWT, verify through the crypto step.
describe("RS256 signature verification (real Web Crypto)", () => {
  async function makeSignedToken(privateKey, header, payload) {
    const h = base64UrlEncode(JSON.stringify(header));
    const p = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${h}.${p}`;
    const sigBuf = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      privateKey,
      new TextEncoder().encode(signingInput)
    );
    return `${signingInput}.${base64UrlEncode(new Uint8Array(sigBuf))}`;
  }

  it("verifies a correctly-signed token and returns claims", async () => {
    const { publicKey, privateKey } = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const token = await makeSignedToken(privateKey, { alg: "RS256", kid: "test" }, goodPayload());

    // verifySignature crypto step (public key injected — no network cert fetch).
    const { signature, signingInput } = parseJwt(token);
    expect(await verifySignature(publicKey, signature, signingInput)).toBe(true);

    // Full verify-with-injected-key path.
    const claims = await verifyWithKey(token, publicKey, PROJECT, NOW);
    expect(claims).toEqual({ uid: "user-123", email: "u@example.com" });
  });

  it("rejects a token whose payload was tampered with after signing", async () => {
    const { publicKey, privateKey } = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const token = await makeSignedToken(privateKey, { alg: "RS256", kid: "test" }, goodPayload());
    const [h, , sig] = token.split(".");
    const forgedPayload = base64UrlEncode(JSON.stringify(goodPayload({ sub: "attacker" })));
    const forged = `${h}.${forgedPayload}.${sig}`;

    await expect(verifyWithKey(forged, publicKey, PROJECT, NOW)).rejects.toThrow(/signature/);
  });

  it("rejects a token verified against a different key", async () => {
    const kp1 = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    const kp2 = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const token = await makeSignedToken(kp1.privateKey, { alg: "RS256", kid: "test" }, goodPayload());
    await expect(verifyWithKey(token, kp2.publicKey, PROJECT, NOW)).rejects.toThrow(/signature/);
  });
});
