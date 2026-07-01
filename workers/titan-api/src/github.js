// Files a GitHub issue for a support ticket. Keeps reporter PII (email/uid) OUT of the
// public issue — only the opaque ticketId is referenced (the PII mapping lives in KV).
// Ported from functions/index.js submitTicket. fetchImpl injectable for tests.

const REPO_OWNER = "yoseple";
const REPO_NAME = "titan-feedback";

// Pure: build the public issue payload (no email/uid).
export function buildIssuePayload({ subject, message, type, ticketId }) {
  return {
    title: `[${type.toUpperCase()}] ${subject}`,
    body: `**User Report**\n\n${message}\n\n___\n*Ticket:* \`${ticketId}\` · *Type:* ${type}\n_(reporter identity stored privately in KV: ticket:${ticketId})_`,
    labels: [type],
  };
}

export async function fileIssue({ subject, message, type, ticketId, token }, fetchImpl = fetch) {
  const payload = buildIssuePayload({ subject, message, type, ticketId });
  const res = await fetchImpl(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "TitanApp",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const result = await res.json();
  return { url: result.html_url };
}
