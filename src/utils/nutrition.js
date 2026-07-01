import { db } from "../lib/firebase";
import { collection, query, limit, orderBy, getDocs } from "firebase/firestore";
import { callWorker } from "../lib/workerClient";
import { generateContent } from "../lib/ai";
import { rankFoodResults } from "../domain/foodSearch";
import { categorizeFood, calculateTDEE, calculateTargetCalories, computeMacroTargets } from "../domain/nutritionMath";

// Re-export the pure nutrition math so existing imports from '../utils/nutrition' keep working.
export { categorizeFood, calculateTDEE, calculateTargetCalories, computeMacroTargets };

// Food search runs server-side (the worker `/food` route) so the USDA key stays
// off the client and USDA/OpenFoodFacts results are normalized in one place.
const callSearchFood = async (payload) => {
  try {
    // The worker returns { results } DIRECTLY (no Firebase envelope).
    const res = await callWorker('/food', payload);
    return (res && res.results) || [];
  } catch (e) {
    console.warn("Food search failed:", e);
    return [];
  }
};

const cleanText = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
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
export const searchAllFood = async (query) => rankFoodResults(await callSearchFood({ mode: 'search', query }), query);

// Kept for the recipe editor's database-search flow (same server search).
export const searchUSDA = async (query) => rankFoodResults(await callSearchFood({ mode: 'search', query }), query);