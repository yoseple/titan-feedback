// Food search normalization, ported BYTE-FOR-BYTE from functions/index.js
// (searchUsdaServer, searchOffServer, barcodeLookupServer, categorizeFoodServer,
// gramsFromServingSize). Same nutrient IDs, kcal-not-kJ (kJ/4.184 fallback),
// per-100g base, id prefixes (usda_/off_), source labels, and servingGrams parsing.
// The Firestore `food_cache` write is intentionally dropped (the Worker has no Firestore).

// The pure mappers are exported so tests can exercise them without any network.

export function categorizeFood(text) {
  const t = (text || "").toLowerCase();
  if (/beef|chicken|turkey|pork|fish|salmon|tuna|egg|tofu|steak|whey|meat|sausage|bacon|burger|shrimp|protein/.test(t)) return "Proteins";
  if (/spinach|kale|lettuce|apple|banana|berry|vegetable|fruit|onion|tomato|produce|potato|avocado|cucumber|pepper/.test(t)) return "Produce";
  if (/milk|yogurt|cheese|butter|cream/.test(t)) return "Dairy";
  if (/rice|pasta|bread|oat|grain|flour|noodle|bagel|bun|wrap|tortilla/.test(t)) return "Carbs";
  if (/chip|cracker|cookie|bar|snack|chocolate/.test(t)) return "Snacks";
  return "Pantry";
}

// Grams from an OpenFoodFacts serving_size string like "45 g" / "30g (1 bar)" -> 45. Else null.
export function gramsFromServingSize(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*g/i);
  return m ? parseFloat(m[1]) : null;
}

// Pure: map one USDA FDC food item to the normalized shape.
export function mapUsdaFood(item) {
  const nutrients = item.foodNutrients || [];
  const getNut = (id) => {
    const n = nutrients.find((x) => x.nutrientNumber === id);
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
    category: categorizeFood(item.description),
    weight_amount: "100g",
    servingGrams,
    calories: Math.round(getEnergyKcal() || 0),
    protein: Math.round(getNut("203") || 0),
    fats: Math.round(getNut("204") || 0),
    carbs: Math.round(getNut("205") || 0),
  };
}

// Pure: map one OpenFoodFacts search product to the normalized shape.
export function mapOffProduct(item) {
  return {
    id: `off_${item.code}`,
    name: item.product_name || "Unknown",
    brand: item.brands || "OpenFoodFacts",
    source: "OFF",
    category: categorizeFood(item.product_name || ""),
    // Per-100g macros -> base label 100g (so the client calculator scales correctly).
    calories: Math.round(item.nutriments?.["energy-kcal_100g"] || item.nutriments?.["energy-kcal"] || 0),
    protein: Math.round(item.nutriments?.proteins_100g || item.nutriments?.proteins || 0),
    fats: Math.round(item.nutriments?.fat_100g || item.nutriments?.fat || 0),
    carbs: Math.round(item.nutriments?.carbohydrates_100g || item.nutriments?.carbohydrates || 0),
    weight_amount: "100g",
    servingGrams: gramsFromServingSize(item.serving_size),
  };
}

// Pure: map an OFF barcode product (v0 product endpoint) to the normalized shape.
export function mapBarcodeProduct(p) {
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
    category: categorizeFood(p.product_name || ""),
    calories: Math.round(val("energy-kcal_100g", "energy-kcal", "energy-kcal_value", "energy_100g")),
    protein: Math.round(val("proteins_100g", "proteins", "proteins_value")),
    carbs: Math.round(val("carbohydrates_100g", "carbohydrates", "carbohydrates_value")),
    fats: Math.round(val("fat_100g", "fat", "fat_value")),
    weight_amount: "100g",
    servingGrams: gramsFromServingSize(p.serving_size),
  };
}

// --- Network functions (fetchImpl injectable for tests; defaults to global fetch) ---

export async function searchUsda(queryText, key, fetchImpl = fetch) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(queryText)}&pageSize=20&dataType=Branded,Foundation,SR Legacy&api_key=${key}`;
  const res = await fetchImpl(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.foods || data.foods.length === 0) return [];
  return data.foods.map(mapUsdaFood);
}

export async function searchOff(queryText, fetchImpl = fetch) {
  const params = new URLSearchParams({
    search_terms: queryText,
    fields: "code,product_name,brands,nutriments,serving_size",
    page_size: "20",
    json: "true",
  });
  const res = await fetchImpl(`https://us.openfoodfacts.org/api/v2/search?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.products || []).map(mapOffProduct);
}

export async function barcodeLookup(code, fetchImpl = fetch) {
  const res = await fetchImpl(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status === 1 && data.product) {
    return mapBarcodeProduct(data.product);
  }
  return null;
}

// Route orchestrator for POST /food. Returns { results }. No Firestore cache write.
export async function handleFood(body, env, fetchImpl = fetch) {
  const mode = body?.mode === "barcode" ? "barcode" : "search";

  if (mode === "barcode") {
    const code = String(body?.barcode || "").replace(/[^0-9]/g, "").slice(0, 20);
    if (!code) return { results: [] };
    const product = await barcodeLookup(code, fetchImpl).catch(() => null);
    return { results: product ? [product] : [] };
  }

  const q = String(body?.query || "").trim().slice(0, 100);
  if (q.length < 2) return { results: [] };

  const [usda, off] = await Promise.all([
    searchUsda(q, env.USDA_API_KEY, fetchImpl).catch(() => []),
    searchOff(q, fetchImpl).catch(() => []),
  ]);
  return { results: [...usda, ...off] };
}
