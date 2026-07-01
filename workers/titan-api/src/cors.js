// Pure CORS helpers — no Worker globals in the decision logic, so it is unit-testable.

// Parse the ALLOWED_ORIGINS var (comma-separated string) into a clean array.
export function parseAllowedOrigins(allowed) {
  if (Array.isArray(allowed)) return allowed.map((s) => String(s).trim()).filter(Boolean);
  return String(allowed || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Decide the CORS headers for a request. The Access-Control-Allow-Origin header is
// only set (reflecting the request origin) when the origin is on the allow-list.
export function corsHeaders(origin, allowedOrigins) {
  const list = parseAllowedOrigins(allowedOrigins);
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && list.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

// 204 preflight response carrying the right CORS headers.
export function preflightResponse(origin, allowedOrigins) {
  return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigins) });
}
