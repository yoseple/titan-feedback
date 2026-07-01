// Firebase ID token (RS256) verification using only Web Crypto — no Firebase Admin.
//
// Flow: parse JWT -> fetch+cache Google securetoken x509 certs in KV (honoring
// Cache-Control max-age) -> extract the SPKI public key from the cert's DER ->
// import it -> verify the RS256 signature -> validate claims.
//
// Pure helpers (base64url, parseJwt, validateClaims, verifySignature, verifyWithKey)
// are exported so the whole chain can be unit-tested without any network.

const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const CERT_CACHE_KEY = "certs:securetoken";

// --- base64url <-> bytes ------------------------------------------------------

export function base64UrlDecode(str) {
  let b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad === 2) b64 += "==";
  else if (pad === 3) b64 += "=";
  else if (pad === 1) throw new Error("Invalid base64url string");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64UrlDecodeToString(str) {
  return new TextDecoder().decode(base64UrlDecode(str));
}

export function base64UrlEncode(input) {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- JWT parsing --------------------------------------------------------------

export function parseJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecodeToString(headerB64));
  const payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  const signature = base64UrlDecode(signatureB64);
  return { header, payload, signature, signingInput: `${headerB64}.${payloadB64}` };
}

// --- Claim validation (pure) --------------------------------------------------

export function validateClaims(payload, projectId, nowSeconds) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid token payload");
  const expectedIss = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIss) throw new Error("Invalid token issuer");
  if (payload.aud !== projectId) throw new Error("Invalid token audience");
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) throw new Error("Token expired");
  if (typeof payload.iat !== "number" || payload.iat > nowSeconds) throw new Error("Token issued in the future");
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("Token missing subject");
  return { uid: payload.sub, email: payload.email };
}

// --- Signature verification ---------------------------------------------------

// Verify an RS256 signature over `signingInput` with an already-imported public key.
// Injectable so tests can generate a keypair and prove the crypto step works.
export async function verifySignature(publicKey, signature, signingInput) {
  const data = new TextEncoder().encode(signingInput);
  return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, publicKey, signature, data);
}

// Full verify given an already-imported public key (skips the network cert fetch).
export async function verifyWithKey(idToken, publicKey, projectId, nowSeconds) {
  const { header, payload, signature, signingInput } = parseJwt(idToken);
  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm");
  const ok = await verifySignature(publicKey, signature, signingInput);
  if (!ok) throw new Error("Invalid token signature");
  return validateClaims(payload, projectId, nowSeconds);
}

// --- X.509 -> SPKI extraction (minimal DER walk) ------------------------------

// Read one ASN.1 DER TLV at `offset`. Returns tag, content bounds, and `next`.
function readTLV(bytes, offset) {
  const tag = bytes[offset];
  let i = offset + 1;
  let len = bytes[i];
  i += 1;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let k = 0; k < n; k++) {
      len = len * 256 + bytes[i];
      i += 1;
    }
  }
  return { tag, length: len, contentStart: i, contentEnd: i + len, next: i + len };
}

// Extract the SubjectPublicKeyInfo (SPKI) DER bytes from an X.509 certificate DER.
export function spkiFromX509Der(der) {
  const cert = readTLV(der, 0); // Certificate ::= SEQUENCE
  const tbs = readTLV(der, cert.contentStart); // TBSCertificate ::= SEQUENCE
  let p = tbs.contentStart;
  let el = readTLV(der, p);
  if (el.tag === 0xa0) {
    // version [0] EXPLICIT — skip it.
    p = el.next;
    el = readTLV(der, p);
  }
  // el is now serialNumber. Walk forward 5 elements to reach subjectPublicKeyInfo:
  // serialNumber -> signature -> issuer -> validity -> subject -> subjectPublicKeyInfo.
  for (let k = 0; k < 5; k++) {
    p = el.next;
    el = readTLV(der, p);
  }
  return der.slice(p, el.next);
}

export function pemToDer(pem) {
  const b64 = String(pem)
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Cert fetch + KV cache ----------------------------------------------------

export function parseMaxAge(cacheControl) {
  if (!cacheControl) return 3600;
  const m = /max-age\s*=\s*(\d+)/i.exec(cacheControl);
  return m ? parseInt(m[1], 10) : 3600;
}

async function getCerts(env, fetchImpl, now) {
  const cached = await env.TITAN_KV.get(CERT_CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.certs && typeof parsed.expiresAt === "number" && parsed.expiresAt > now) {
        return parsed.certs;
      }
    } catch {
      /* corrupt cache — fall through and refetch */
    }
  }
  const res = await fetchImpl(CERT_URL);
  if (!res.ok) throw new Error("Failed to fetch signing certs");
  const certs = await res.json();
  const maxAge = parseMaxAge(res.headers.get("Cache-Control"));
  try {
    await env.TITAN_KV.put(
      CERT_CACHE_KEY,
      JSON.stringify({ certs, expiresAt: now + maxAge }),
      { expirationTtl: Math.max(60, maxAge) }
    );
  } catch {
    /* caching is best-effort */
  }
  return certs;
}

// --- Public entry point -------------------------------------------------------

export async function verifyFirebaseToken(idToken, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);

  const { header, payload, signature, signingInput } = parseJwt(idToken);
  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm");
  if (!header.kid) throw new Error("Token missing key id");

  const certs = await getCerts(env, fetchImpl, now);
  // Own-property lookup so an attacker-chosen kid can't resolve an inherited
  // Object.prototype member (e.g. "constructor"/"__proto__") — fail closed.
  const pem = Object.prototype.hasOwnProperty.call(certs, header.kid) ? certs[header.kid] : null;
  if (!pem) throw new Error("No matching signing cert");

  const spki = spkiFromX509Der(pemToDer(pem));
  const publicKey = await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const ok = await verifySignature(publicKey, signature, signingInput);
  if (!ok) throw new Error("Invalid token signature");

  return validateClaims(payload, env.FIREBASE_PROJECT_ID, now);
}
