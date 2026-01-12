// src/utils/nutrition.js

const USDA_API_KEY = 'FwJSd1knWWtSYLVfwdlh2Twc01RI3Rp1E1odh3Us'; 

// ============================================================================
// 1. RELEVANCE ENGINE
// ============================================================================
const cleanText = (str) => {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/['’]/g, '')       
    .replace(/[^a-z0-9\s]/g, ' ') 
    .trim()
    .replace(/\s+/g, ' ');      
};

const calculateRelevance = (item, queryRaw) => {
  const query = cleanText(queryRaw);
  const name = cleanText(item.name);
  const brand = cleanText(item.brand || '');
  
  let score = 0;
  if (name === query) score += 100;                 
  else if (name.startsWith(query)) score += 80;     
  else if (name.includes(query)) score += 60;       

  const queryWords = query.split(' ');
  let wordMatches = 0;
  queryWords.forEach(w => {
    if (name.includes(w)) wordMatches++;
    if (brand.includes(w)) score += 25; 
  });
  if (wordMatches === queryWords.length) score += 30;
  score += (wordMatches * 10);

  if (item.source === 'USDA' && item.brand !== 'Generic') score += 10;
  score -= (name.length * 0.5);

  return score;
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

// ============================================================================
// 2. SEARCH FUNCTIONS
// ============================================================================
export const searchUSDA = async (query) => {
  try {
    const searchUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=20&dataType=Branded,Foundation,SR Legacy&api_key=${USDA_API_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    
    if (!searchData.foods || searchData.foods.length === 0) return [];

    const fdcIds = searchData.foods.slice(0, 10).map(f => f.fdcId);
    const detailsUrl = `https://api.nal.usda.gov/fdc/v1/foods?api_key=${USDA_API_KEY}`;
    const detailsRes = await fetch(detailsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fdcIds: fdcIds, format: 'full' })
    });
    
    const detailedFoods = await detailsRes.json();

    return detailedFoods.map(item => {
      const getNut = (id) => {
         const n = item.foodNutrients.find(x => x.nutrient.number === id || x.nutrient.id === parseInt(id));
         return n ? (n.amount || n.value || 0) : 0;
      };

      const cal100 = getNut('208') || getNut('268') || getNut('957') || 0; 
      const pro100 = getNut('203');
      const fat100 = getNut('204');
      const carb100 = getNut('205');
      const fib100 = getNut('291');

      let servingSize = 100;
      let servingLabel = "100g";
      
      if (item.servingSize) {
        servingSize = item.servingSize;
        servingLabel = `${item.servingSize} ${item.servingSizeUnit} (${item.householdServingFullText || '1 Serving'})`;
      } 
      else if (item.foodPortions && item.foodPortions.length > 0) {
        const bestPortion = item.foodPortions.sort((a,b) => b.gramWeight - a.gramWeight)[0];
        servingSize = bestPortion.gramWeight;
        servingLabel = `${bestPortion.amount || 1} ${bestPortion.modifier || bestPortion.measureUnit.name} (${Math.round(servingSize)}g)`;
      }

      const ratio = servingSize / 100;

      return {
        id: `usda_${item.fdcId}`,
        name: item.description,
        brand: item.brandOwner || 'Generic',
        source: 'USDA',
        category: categorizeFood(item.description),
        image: null,
        ingredients: item.ingredients || "See Details",
        weight_amount: servingLabel,
        defaultPortion: servingSize,
        calories: Math.round(cal100 * ratio),
        protein: Math.round(pro100 * ratio),
        fats: Math.round(fat100 * ratio),
        carbs: Math.round(carb100 * ratio),
        fiber: Math.round(fib100 * ratio),
        netCarbs: Math.round((carb100 - fib100) * ratio),
        caloriesPer100g: cal100,
        proteinPer100g: pro100,
        fatsPer100g: fat100,
        carbsPer100g: carb100
      };
    });
  } catch (error) {
    console.warn("USDA Hydration Error:", error);
    return [];
  }
};

export const searchOpenFoodFacts = async (query) => {
  try {
    const baseUrl = 'https://world.openfoodfacts.org/api/v2/search';
    const params = new URLSearchParams({
      search_terms: query,
      fields: 'code,product_name,brands,nutriments,ingredients_text,image_url,serving_size',
      sort_by: 'popularity_key',
      page_size: '15', 
      json: 'true'
    });

    const response = await fetch(`${baseUrl}?${params.toString()}`, {
        method: 'GET',
        headers: { 'User-Agent': 'TitanFitnessApp/1.0' }
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    if (!data.products) return [];

    return data.products.map(item => {
        let sWeight = 100;
        let sLabel = "100g";
        
        if (item.serving_size) {
            const match = item.serving_size.match(/(\d+(\.\d+)?)\s*g/i) || item.serving_size.match(/\(([\d\.]+)\s*g\)/i);
            if (match) sWeight = parseFloat(match[1]);
            sLabel = item.serving_size;
        }
        const ratio = sWeight / 100;
        const n = item.nutriments;

        return {
          id: `off_${item.code}`,
          name: item.product_name || 'Unknown Product',
          brand: item.brands || 'OpenFoodFacts',
          source: 'OFF',
          category: categorizeFood(item.product_name),
          image: item.image_url || null,
          ingredients: item.ingredients_text || "Unavailable",
          weight_amount: sLabel,
          defaultPortion: sWeight,
          calories: Math.round((n['energy-kcal_100g'] || 0) * ratio),
          protein: Math.round((n.proteins_100g || 0) * ratio),
          fats: Math.round((n.fat_100g || 0) * ratio),
          carbs: Math.round((n.carbohydrates_100g || 0) * ratio),
          fiber: Math.round((n.fiber_100g || 0) * ratio),
          netCarbs: Math.round(((n.carbohydrates_100g || 0) - (n.fiber_100g || 0)) * ratio),
          caloriesPer100g: n['energy-kcal_100g'],
          proteinPer100g: n.proteins_100g,
          fatsPer100g: n.fat_100g,
          carbsPer100g: n.carbohydrates_100g
        };
    }).filter(i => (i.calories > 0 || i.protein > 0)); 
  } catch (error) {
    console.warn("OFF Error:", error);
    return [];
  }
};

export const searchAllFood = async (query) => {
    const [usda, off] = await Promise.all([
        searchUSDA(query),
        searchOpenFoodFacts(query)
    ]);
    let allResults = [...usda, ...off];
    allResults = allResults.map(item => ({
      ...item, 
      sortScore: calculateRelevance(item, query)
    }));
    allResults.sort((a, b) => b.sortScore - a.sortScore);
    return allResults;
};

// ============================================================================
// 3. CALORIE & TARGET CALCULATORS (IMPROVED MATH)
// ============================================================================

export const calculateTDEE = (weightLbs, heightCm, age, gender, activityLevel = 'moderate') => {
    // 1. Convert to Metric (Precise conversion)
    const weightKg = (parseFloat(weightLbs) || 180) * 0.45359237; 
    const height = parseFloat(heightCm) || 175; 
    const ageVal = parseFloat(age) || 25;

    // 2. BMR (Basal Metabolic Rate) - Mifflin-St Jeor Equation
    let bmr = (10 * weightKg) + (6.25 * height) - (5 * ageVal);
    
    if (gender === 'female') {
        bmr -= 161;
    } else {
        bmr += 5;
    }

    // 3. Activity Multipliers
    const multipliers = {
        sedentary: 1.2,      // Desk job, little to no exercise
        light: 1.375,        // Light exercise 1–3 days/week
        moderate: 1.55,      // Moderate exercise 3–5 days/week
        active: 1.725,       // Hard exercise 6–7 days/week
        extreme: 1.9         // Physical job + training
    };

    const level = activityLevel?.toLowerCase() || 'moderate';
    const multiplier = multipliers[level] || 1.375; 

    return Math.round(bmr * multiplier); 
};

export const calculateTargetCalories = (tdee, goal) => {
    let target = tdee;
    
    // --- SMART PERCENTAGE LOGIC ---
    if (goal === 'cut') {
        // 20% Deficit (Moderate Cut)
        // This scales better than fixed 500. (e.g., 3000 -> 2400, 1600 -> 1280)
        target = tdee * 0.80; 
        
        // SAFETY FLOOR: Never suggest below 1200 calories without medical supervision
        if (target < 1200) target = 1200;
    } 
    else if (goal === 'bulk') {
        // 10% Surplus (Lean Bulk)
        // Prevents excessive fat gain compared to fixed +500
        target = tdee * 1.10;
    }
    // Maintenance = TDEE (No change)

    return Math.round(target);
};