const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// --- SECRETS ---
const apiKey = defineSecret("GEMINI_API_KEY");
const githubToken = defineSecret("GITHUB_TOKEN");
const usdaKey = defineSecret("USDA_API_KEY");

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

// --- 3. FOOD SEARCH PROXY -------------------------------------------------
// Runs USDA + OpenFoodFacts search server-side so the USDA key never ships to the
// client, normalizes results in one place (kcal-not-kJ, per-100g base), and writes
// the top result to food_cache via the Admin SDK (food_cache is client read-only).

function categorizeFoodServer(text) {
  const t = (text || "").toLowerCase();
  if (/beef|chicken|turkey|pork|fish|salmon|tuna|egg|tofu|steak|whey|meat|sausage|bacon|burger|shrimp|protein/.test(t)) return "Proteins";
  if (/spinach|kale|lettuce|apple|banana|berry|vegetable|fruit|onion|tomato|produce|potato|avocado|cucumber|pepper/.test(t)) return "Produce";
  if (/milk|yogurt|cheese|butter|cream/.test(t)) return "Dairy";
  if (/rice|pasta|bread|oat|grain|flour|noodle|bagel|bun|wrap|tortilla/.test(t)) return "Carbs";
  if (/chip|cracker|cookie|bar|snack|chocolate/.test(t)) return "Snacks";
  return "Pantry";
}

// Grams from an OpenFoodFacts serving_size string like "45 g" / "30g (1 bar)" -> 45. Else null.
function gramsFromServingSize(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*g/i);
  return m ? parseFloat(m[1]) : null;
}

async function searchUsdaServer(queryText, key) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(queryText)}&pageSize=20&dataType=Branded,Foundation,SR Legacy&api_key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.foods || data.foods.length === 0) return [];
  return data.foods.map((item) => {
    const nutrients = item.foodNutrients || [];
    const getNut = (id1, id2) => {
      const n = nutrients.find((x) => x.nutrientNumber === id1 || x.nutrientNumber === id2);
      return n ? (n.value || 0) : 0;
    };
    // Prefer kcal (208 / unit KCAL); only fall back to kJ (268) WITH /4.184 conversion.
    const getEnergyKcal = () => {
      const kcal = nutrients.find((x) => x.nutrientNumber === "208" || (x.unitName && x.unitName.toUpperCase() === "KCAL"));
      if (kcal && kcal.value) return kcal.value;
      const kj = nutrients.find((x) => x.nutrientNumber === "268" || (x.unitName && x.unitName.toUpperCase() === "KJ"));
      if (kj && kj.value) return kj.value / 4.184;
      return 0;
    };
    // Canonical per-100g macros (FDC nutrient values are per 100 g) + serving size in grams
    // as a portion hint, so the client can offer accurate "100 g" / "1 serving" chips.
    let servingGrams = null;
    if (item.servingSize && item.servingSizeUnit) {
      const unit = item.servingSizeUnit.toLowerCase();
      if (unit === "g" || unit === "ml") servingGrams = item.servingSize;
    }
    return {
      id: `usda_${item.fdcId}`,
      name: item.description,
      brand: item.brandOwner || "Generic",
      source: "USDA",
      category: categorizeFoodServer(item.description),
      weight_amount: "100g",
      servingGrams,
      calories: Math.round(getEnergyKcal() || 0),
      protein: Math.round(getNut("203") || 0),
      fats: Math.round(getNut("204") || 0),
      carbs: Math.round(getNut("205") || 0),
    };
  });
}

async function searchOffServer(queryText) {
  const params = new URLSearchParams({
    search_terms: queryText,
    fields: "code,product_name,brands,nutriments,serving_size",
    page_size: "20",
    json: "true",
  });
  const res = await fetch(`https://us.openfoodfacts.org/api/v2/search?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.products || []).map((item) => ({
    id: `off_${item.code}`,
    name: item.product_name || "Unknown",
    brand: item.brands || "OpenFoodFacts",
    source: "OFF",
    category: categorizeFoodServer(item.product_name || ""),
    // Per-100g macros -> base label 100g (so the client calculator scales correctly).
    calories: Math.round(item.nutriments?.["energy-kcal_100g"] || item.nutriments?.["energy-kcal"] || 0),
    protein: Math.round(item.nutriments?.proteins_100g || item.nutriments?.proteins || 0),
    fats: Math.round(item.nutriments?.fat_100g || item.nutriments?.fat || 0),
    carbs: Math.round(item.nutriments?.carbohydrates_100g || item.nutriments?.carbohydrates || 0),
    weight_amount: "100g",
    servingGrams: gramsFromServingSize(item.serving_size),
  }));
}

async function barcodeLookupServer(code) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status === 1 && data.product) {
    const p = data.product;
    const n = p.nutriments || {};
    const val = (...keys) => {
      for (const k of keys) {
        if (n[k] !== undefined && n[k] !== null && n[k] !== "") return parseFloat(n[k]);
      }
      return 0;
    };
    return {
      id: `off_${p.code}`,
      name: p.product_name || "Unknown Product",
      brand: p.brands || "Generic",
      source: "Scan 📸",
      category: categorizeFoodServer(p.product_name || ""),
      calories: Math.round(val("energy-kcal_100g", "energy-kcal", "energy-kcal_value", "energy_100g")),
      protein: Math.round(val("proteins_100g", "proteins", "proteins_value")),
      carbs: Math.round(val("carbohydrates_100g", "carbohydrates", "carbohydrates_value")),
      fats: Math.round(val("fat_100g", "fat", "fat_value")),
      weight_amount: "100g",
      servingGrams: gramsFromServingSize(p.serving_size),
    };
  }
  return null;
}

async function cacheTopResult(results) {
  const top = results && results[0];
  if (!top || !top.name || top.name === "Unknown" || top.name === "Unknown Product") return;
  try {
    await db.collection("food_cache").add({
      ...top,
      name_lower: String(top.name).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim(),
      cachedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Cache write failed:", e);
  }
}

exports.searchFood = onCall({
  secrets: [usdaKey],
  cors: true,
  region: "us-central1",
  minInstances: 0,
  maxInstances: 10,
  concurrency: 80,
  memory: "256MiB",
  timeoutSeconds: 30,
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be logged in.");

  const mode = request.data?.mode === "barcode" ? "barcode" : "search";

  if (mode === "barcode") {
    const code = String(request.data?.barcode || "").replace(/[^0-9]/g, "").slice(0, 20);
    if (!code) throw new HttpsError("invalid-argument", "Missing barcode.");
    const product = await barcodeLookupServer(code).catch(() => null);
    if (product) await cacheTopResult([product]);
    return { results: product ? [product] : [] };
  }

  const q = String(request.data?.query || "").trim().slice(0, 100);
  if (q.length < 2) return { results: [] };

  const [usda, off] = await Promise.all([
    searchUsdaServer(q, usdaKey.value()).catch(() => []),
    searchOffServer(q).catch(() => []),
  ]);
  const results = [...usda, ...off];
  await cacheTopResult(results);
  return { results };
});
// --- 4. PER-DAY FOOD ROLLUP ----------------------------------------------
// Maintains artifacts/{appId}/users/{uid}/daily_summaries/{date} with that day's
// food totals, so dashboards / 30-day trends can read O(1) summary docs instead
// of scanning the (capped) food_logs. Re-aggregates the affected day on each write.
exports.aggregateDailyFood = onDocumentWritten({
  document: "artifacts/{appId}/users/{uid}/food_logs/{logId}",
  region: "us-central1",
}, async (event) => {
  const { appId, uid } = event.params;
  const after = event.data && event.data.after && event.data.after.data();
  const before = event.data && event.data.before && event.data.before.data();
  const date = (after && after.date) || (before && before.date);
  if (!date) return;
  try {
    const userRef = db.collection("artifacts").doc(appId).collection("users").doc(uid);
    const snap = await userRef.collection("food_logs").where("date", "==", date).get();
    const totals = { calories: 0, protein: 0, carbs: 0, fats: 0, count: 0 };
    snap.forEach((d) => {
      const f = d.data() || {};
      totals.calories += f.calories || 0;
      totals.protein += f.protein || 0;
      totals.carbs += f.carbs || 0;
      totals.fats += f.fats || 0;
      totals.count += 1;
    });
    await userRef.collection("daily_summaries").doc(date)
      .set({ ...totals, date, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (e) {
    console.error("aggregateDailyFood failed", e);
  }
});
