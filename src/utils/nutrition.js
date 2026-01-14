import { db } from "../lib/firebase"; 
import { collection, query, limit, addDoc, orderBy, startAt, endAt, getDocs, where } from "firebase/firestore";
import { generateContent } from "../lib/ai"; 

const USDA_API_KEY = 'FwJSd1knWWtSYLVfwdlh2Twc01RI3Rp1E1odh3Us'; 

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

export const saveToCache = async (items, searchQuery) => {
  if (!items || items.length === 0) return;
  const topResult = items[0]; 
  
  if (!topResult.name || topResult.name === "Unknown") return;

  try {
    const cacheRef = collection(db, 'food_cache');
    await addDoc(cacheRef, {
      ...topResult,
      name_lower: cleanText(topResult.name), 
      cachedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn("Cache Write Error:", err);
  }
};

// --- 2. BARCODE SEARCH (ROBUST MACROS) ---
export const searchByBarcode = async (barcode) => {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();
    
    if (data.status === 1 && data.product) {
       const p = data.product;
       const n = p.nutriments || {};

       // Helper to safely get nutrient values checking multiple keys
       const val = (...keys) => {
           for (const k of keys) {
               if (n[k] !== undefined && n[k] !== null && n[k] !== '') return parseFloat(n[k]);
           }
           return 0;
       };

       return {
         id: `off_${p.code}`,
         name: p.product_name || "Unknown Product",
         brand: p.brands || "Generic",
         // Aggressively look for values
         calories: Math.round(val('energy-kcal_100g', 'energy-kcal', 'energy-kcal_value', 'energy_100g')),
         protein: Math.round(val('proteins_100g', 'proteins', 'proteins_value')),
         carbs: Math.round(val('carbohydrates_100g', 'carbohydrates', 'carbohydrates_value')),
         fats: Math.round(val('fat_100g', 'fat', 'fat_value')),
         weight_amount: p.serving_size || "100g",
         source: 'Scan 📸'
       };
    }
    return null;
  } catch (err) {
    return null;
  }
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

// --- 4. EXTERNAL APIS ---
export const searchUSDA = async (query) => {
  try {
    // Single-Pass Extraction (Fast)
    const searchUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=20&dataType=Branded,Foundation,SR Legacy&api_key=${USDA_API_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (!searchData.foods || searchData.foods.length === 0) return [];

    return searchData.foods.map(item => {
      const getNut = (id1, id2) => {
         const n = item.foodNutrients.find(x => x.nutrientNumber === id1 || x.nutrientNumber === id2);
         return n ? (n.value || 0) : 0;
      };
      
      let servingLabel = "100g"; 
      let ratio = 1;

      if (item.servingSize && item.servingSizeUnit) {
          const unit = item.servingSizeUnit.toLowerCase();
          if (unit === 'g' || unit === 'ml') {
              ratio = item.servingSize / 100;
              servingLabel = `${item.servingSize} ${item.servingSizeUnit}`;
          }
      } else if (item.foodPortions?.[0]) { 
          servingLabel = "100g";
      }
      
      return {
        id: `usda_${item.fdcId}`,
        name: item.description,
        brand: item.brandOwner || 'Generic',
        source: 'USDA',
        category: categorizeFood(item.description),
        weight_amount: servingLabel,
        calories: Math.round((getNut('208', '268') || 0) * ratio),
        protein: Math.round((getNut('203') || 0) * ratio),
        fats: Math.round((getNut('204') || 0) * ratio),
        carbs: Math.round((getNut('205') || 0) * ratio),
      };
    });
  } catch (error) { return []; }
};

export const searchOpenFoodFacts = async (query) => {
  try {
    // UPDATED: 'us.openfoodfacts.org' to restrict to United States
    const baseUrl = 'https://us.openfoodfacts.org/api/v2/search';
    const params = new URLSearchParams({ 
        search_terms: query, 
        fields: 'code,product_name,brands,nutriments,serving_size', 
        page_size: '20', 
        json: 'true' 
    });
    
    const response = await fetch(`${baseUrl}?${params.toString()}`);
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.products || []).map(item => ({
        id: `off_${item.code}`,
        name: item.product_name || 'Unknown',
        brand: item.brands || 'OpenFoodFacts',
        source: 'OFF',
        calories: Math.round(item.nutriments?.['energy-kcal_100g'] || item.nutriments?.['energy-kcal'] || 0),
        protein: Math.round(item.nutriments?.proteins_100g || item.nutriments?.proteins || 0),
        fats: Math.round(item.nutriments?.fat_100g || item.nutriments?.fat || 0),
        carbs: Math.round(item.nutriments?.carbohydrates_100g || item.nutriments?.carbohydrates || 0),
        weight_amount: item.serving_size || "100g"
    }));
  } catch (error) { return []; }
};

// --- 5. MAIN SEARCH ---
export const searchAllFood = async (query) => {
    console.log("🌐 searching USDA/OFF for:", query);
    const [usda, off] = await Promise.all([searchUSDA(query), searchOpenFoodFacts(query)]);

    let results = [...usda, ...off];
    if (results.length > 0) saveToCache(results.slice(0, 1), query); 
    return results;
};

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