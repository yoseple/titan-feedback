import { db, app } from "../lib/firebase";
import { collection, query, limit, orderBy, getDocs } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { generateContent } from "../lib/ai";

// Food search runs server-side (the `searchFood` callable) so the USDA key stays
// off the client and USDA/OpenFoodFacts results are normalized + cached in one place.
const functions = getFunctions(app, "us-central1");
const callSearchFood = async (payload) => {
  try {
    const res = await httpsCallable(functions, 'searchFood')(payload);
    return (res.data && res.data.results) || [];
  } catch (e) {
    console.warn("Food search failed:", e);
    return [];
  }
};

const cleanText = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
};

export const categorizeFood = (text) => {
  const t = (text || '').toLowerCase();
  if (t.match(/beef|chicken|turkey|pork|fish|salmon|tuna|egg|tofu|steak|whey|meat|sausage|bacon|burger|shrimp|protein/)) return 'Proteins';
  if (t.match(/spinach|kale|lettuce|apple|banana|berry|vegetable|fruit|onion|tomato|produce|potato|avocado|cucumber|pepper/)) return 'Produce';
  if (t.match(/milk|yogurt|cheese|butter|cream/)) return 'Dairy';
  if (t.match(/rice|pasta|bread|oat|grain|flour|noodle|bagel|bun|wrap|tortilla/)) return 'Carbs';
  if (t.match(/chip|cracker|cookie|bar|snack|chocolate/)) return 'Snacks';
  return 'Pantry'; 
};

// --- 1. INSTANT SUGGESTIONS (Local Cache) ---
export const getSuggestions = async (searchQuery) => {
  if (!searchQuery || searchQuery.length < 2) return [];
  const term = cleanText(searchQuery);

  try {
    const cacheRef = collection(db, 'food_cache');
    // Fetch recent popular items (Limit 50 to allow in-memory filtering)
    const q = query(cacheRef, orderBy('cachedAt', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    
    const allDocs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, source: 'TitanDB' }));
    
    // "Contains" search + Relevance Sort
    return allDocs
        .filter(item => item.name_lower && item.name_lower.includes(term))
        .sort((a, b) => {
            const aStarts = a.name_lower.startsWith(term);
            const bStarts = b.name_lower.startsWith(term);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
        })
        .slice(0, 10);
  } catch (err) {
    console.warn("Cache Read Error", err);
    return [];
  }
};

// saveToCache removed — the server-side `searchFood` callable now writes food_cache
// via the Admin SDK; Firestore rules make food_cache client read-only (no poisoning).

// --- 2. BARCODE SEARCH (server-proxied, keyless OFF lookup) ---
export const searchByBarcode = async (barcode) => {
  const results = await callSearchFood({ mode: 'barcode', barcode });
  return results[0] || null;
};

// --- 3. TITAN AI SEARCH ---
export const searchAI = async (query) => {
    try {
        const prompt = `Estimate nutrition for: "${query}". 
        Align values with standard USDA reference data for raw product if not specified.
        Return strictly valid JSON with no markdown: 
        { "name": "${query}", "brand": "AI Estimate", "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "weight_amount": "1 serving" }`;
        
        const data = await generateContent(prompt, 'search');
        if (data) {
            return {
                ...data,
                id: `ai_${Date.now()}`,
                source: 'AI ✨', 
                category: categorizeFood(data.name)
            };
        }
    } catch (e) {
        console.warn("AI Search silent fail", e);
    }
    return null;
};

// --- 4. EXTERNAL FOOD SEARCH (server-proxied USDA + OpenFoodFacts) ---
// The USDA key, fetching, and kcal/per-100g normalization now live in the
// `searchFood` Cloud Function. These are thin callable wrappers.
export const searchAllFood = async (query) => callSearchFood({ mode: 'search', query });

// Kept for the recipe editor's database-search flow (same server search).
export const searchUSDA = async (query) => callSearchFood({ mode: 'search', query });

// --- 6. CALCULATIONS (Restored Exports) ---
export const calculateTDEE = (weightLbs, heightCm, age, gender, activityLevel = 'moderate') => {
    const weightKg = (parseFloat(weightLbs) || 180) * 0.45359237; 
    const height = parseFloat(heightCm) || 175; 
    const ageVal = parseFloat(age) || 25;
    let bmr = (10 * weightKg) + (6.25 * height) - (5 * ageVal);
    if (gender === 'female') bmr -= 161; else bmr += 5;
    const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, extreme: 1.9 };
    return Math.round(bmr * (multipliers[activityLevel] || 1.375)); 
};

export const calculateTargetCalories = (tdee, goal) => {
    let target = tdee;
    if (goal === 'cut') { target = tdee * 0.80; if (target < 1200) target = 1200; }
    else if (goal === 'bulk') { target = tdee * 1.10; }
    return Math.round(target);
};

// Single source of truth for macro goals. Protein/fat scale with bodyweight;
// carbs fill the remaining calories; fiber ~14g per 1000 kcal. Replaces the
// hardcoded 250/80 (Dashboard) and divergent 150/200/60 (CalorieDashboard).
export const computeMacroTargets = (caloriesTarget, goal = 'maintenance', weightLbs = 180) => {
    const cals = parseFloat(caloriesTarget) || 2000;
    const w = parseFloat(weightLbs) || 180;
    const protein = Math.round(w * (goal === 'cut' ? 1.0 : 0.8)); // g/lb
    const fats = Math.round(w * 0.35);                            // g/lb
    const carbs = Math.max(0, Math.round((cals - (protein * 4) - (fats * 9)) / 4));
    const fiber = Math.round((cals / 1000) * 14);
    return { protein, carbs, fats, fiber };
};