const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// --- SECRETS ---
const apiKey = defineSecret("GEMINI_API_KEY");
const githubToken = defineSecret("GITHUB_TOKEN");

const REPO_OWNER = "yoseple";
const REPO_NAME = "titan-feedback";

// --- 1. AI GENERATION (SCALED FOR 30+ USERS) ---
exports.generateAI = onCall({ 
  secrets: [apiKey], 
  cors: true,
  region: "us-central1", // Explicitly set region to match your logs
  // SCALE SETTINGS
  minInstances: 0,       // 0 saves money, 1 eliminates "cold start" wait times
  maxInstances: 10,      // Cap to prevent infinite billing
  concurrency: 80,       // CRITICAL: Allows 80 users to hit 1 server at once
  memory: "512MiB",      // AI requests are text-heavy, not RAM heavy
  timeoutSeconds: 60     // Give AI time to think
}, async (request) => {
  
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be logged in.");

  const uid = request.auth.uid;
  const { prompt, type } = request.data;
  const requestType = type === 'search' ? 'search' : 'chat';

  // Basic input validation (reduce abuse / runaway prompts).
  if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > 8000) {
    throw new HttpsError('invalid-argument', 'Prompt is missing or too long.');
  }

  // LIMITS
  const CHAT_LIMIT = 30;
  const SEARCH_LIMIT = 150;
  const limit = requestType === 'chat' ? CHAT_LIMIT : SEARCH_LIMIT;

  const today = new Date().toISOString().split('T')[0];
  const userUsageRef = db.collection('user_usage').doc(uid);

  // Best-effort pre-check so we don't spend a Gemini call when clearly over quota.
  const preSnap = await userUsageRef.get();
  const preData = preSnap.exists ? preSnap.data() : {};
  const usedToday = preData.date === today ? (preData[requestType] || 0) : 0;
  if (usedToday >= limit) {
    throw new HttpsError('resource-exhausted', `Daily ${requestType} limit reached (${limit}/${limit}).`);
  }

  // --- CALL GEMINI (quota is charged only AFTER a successful generation) ---
  const key = apiKey.value();
  let text;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Force valid JSON so the client never has to string-surgery the response; cap tokens for cost.
        generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 2048 }
      })
    });
    if (!response.ok) throw new Error(`Gemini ${response.status} ${response.statusText}`);
    const data = await response.json();
    text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch (error) {
    console.error("AI Error:", error);
    // No quota charged — the generation failed.
    throw new HttpsError("internal", "AI generation failed");
  }

  if (!text) {
    // Safety-blocked / empty completion: do NOT charge quota.
    throw new HttpsError("internal", "AI returned an empty response.");
  }

  // Charge quota transactionally (atomic, daily reset) — only on a successful generation.
  let remaining = limit;
  try {
    remaining = await db.runTransaction(async (tx) => {
      const s = await tx.get(userUsageRef);
      const d = s.exists ? s.data() : {};
      const isToday = d.date === today;
      const chat = (isToday ? (d.chat || 0) : 0) + (requestType === 'chat' ? 1 : 0);
      const search = (isToday ? (d.search || 0) : 0) + (requestType === 'search' ? 1 : 0);
      tx.set(userUsageRef, { date: today, chat, search }, { merge: true });
      return limit - (requestType === 'chat' ? chat : search);
    });
  } catch (e) {
    console.warn("Quota accounting failed (generation already returned):", e);
  }

  return { text, remaining };
});

// --- 2. TICKET SYSTEM ---
exports.submitTicket = onCall({ secrets: [githubToken], cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  
  const uid = request.auth.uid;
  const email = request.auth.token.email || "unknown";
  const subject = String(request.data?.subject || '').slice(0, 200);
  const message = String(request.data?.message || '').slice(0, 5000);
  const type = ['bug', 'feedback'].includes(request.data?.type) ? request.data.type : 'feedback';
  if (!subject || !message) throw new HttpsError('invalid-argument', 'Subject and message are required.');

  // Keep reporter PII (email/uid) OUT of the public GitHub issue. Store the mapping
  // privately in Firestore and reference only an opaque ticket id in the issue body.
  const ticketRef = await db.collection('support_tickets').add({
    uid, email, subject, message, type, createdAt: new Date().toISOString()
  });
  const ticketId = ticketRef.id;

  const token = githubToken.value();
  const payload = {
    title: `[${type.toUpperCase()}] ${subject}`,
    body: `**User Report**\n\n${message}\n\n___\n*Ticket:* \`${ticketId}\` · *Type:* ${type}\n_(reporter identity stored privately in Firestore: support_tickets/${ticketId})_`,
    labels: [type]
  };

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'TitanApp'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new HttpsError('internal', 'GitHub rejected the request.');
    const result = await response.json();
    return { success: true, url: result.html_url, ticketId };
  } catch (error) {
    console.error("Ticket Function Failed:", error);
    // The ticket is already persisted in Firestore even if GitHub filing failed.
    throw new HttpsError('internal', 'Unable to connect to ticketing system.');
  }
});