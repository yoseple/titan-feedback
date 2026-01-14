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

  // --- QUOTA LOGIC ---
  const today = new Date().toISOString().split('T')[0];
  const userUsageRef = db.collection('user_usage').doc(uid);
  const usageSnap = await userUsageRef.get();
  
  let currentUsage = { chat: 0, search: 0, date: today };

  if (usageSnap.exists && usageSnap.data().date === today) {
     currentUsage = usageSnap.data();
  } else {
     currentUsage = { chat: 0, search: 0, date: today };
  }

  // LIMITS
  const CHAT_LIMIT = 30;
  const SEARCH_LIMIT = 150;

  const currentChat = currentUsage.chat || 0;
  const currentSearch = currentUsage.search || 0;

  if (requestType === 'chat' && currentChat >= CHAT_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Daily Chat limit reached (30/30).');
  }
  if (requestType === 'search' && currentSearch >= SEARCH_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Daily Search limit reached.');
  }

  await userUsageRef.set({ 
      date: today,
      chat: requestType === 'chat' ? currentChat + 1 : currentChat,
      search: requestType === 'search' ? currentSearch + 1 : currentSearch
  }, { merge: true });

  // --- CALL GEMINI ---
  const key = apiKey.value();
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!response.ok) throw new Error(`Gemini Error: ${response.statusText}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch (error) {
    console.error("AI Error:", error);
    throw new HttpsError("internal", "AI generation failed");
  }
});

// --- 2. TICKET SYSTEM ---
exports.submitTicket = onCall({ secrets: [githubToken], cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  
  const { subject, message, type } = request.data;
  const uid = request.auth.uid;
  const email = request.auth.token.email || "Unknown User";
  const token = githubToken.value();

  const payload = {
    title: `[${type.toUpperCase()}] ${subject}`,
    body: `**User Report**\n${message}\n\n___\n*Submitted by User:* ${email} (ID: ${uid})`,
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
    return { success: true, url: result.html_url };
  } catch (error) {
    console.error("Ticket Function Failed:", error);
    throw new HttpsError('internal', 'Unable to connect to ticketing system.');
  }
});