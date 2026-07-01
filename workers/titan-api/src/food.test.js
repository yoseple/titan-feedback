import { describe, it, expect } from "vitest";
import {
  categorizeFood,
  gramsFromServingSize,
  mapUsdaFood,
  mapOffProduct,
  mapBarcodeProduct,
  searchUsda,
  searchOff,
  barcodeLookup,
  handleFood,
} from "./food.js";

// Helper: fake fetch returning a canned JSON body.
function jsonFetch(body, ok = true) {
  return async () => ({ ok, json: async () => body });
}

describe("categorizeFood", () => {
  it("maps keywords to categories", () => {
    expect(categorizeFood("Grilled Chicken Breast")).toBe("Proteins");
    expect(categorizeFood("Fresh Spinach")).toBe("Produce");
    expect(categorizeFood("Greek Yogurt")).toBe("Dairy");
    expect(categorizeFood("White Rice")).toBe("Carbs");
    expect(categorizeFood("Chocolate Chip Cookie")).toBe("Snacks");
    expect(categorizeFood("Mystery Item")).toBe("Pantry");
    expect(categorizeFood("")).toBe("Pantry");
    expect(categorizeFood(null)).toBe("Pantry");
  });
});

describe("gramsFromServingSize", () => {
  it("parses grams from OFF serving strings", () => {
    expect(gramsFromServingSize("45 g")).toBe(45);
    expect(gramsFromServingSize("30g (1 bar)")).toBe(30);
    expect(gramsFromServingSize("28.5 g")).toBe(28.5);
  });
  it("returns null when no grams present", () => {
    expect(gramsFromServingSize("1 cup")).toBeNull();
    expect(gramsFromServingSize("")).toBeNull();
    expect(gramsFromServingSize(null)).toBeNull();
  });
});

describe("mapUsdaFood energy handling", () => {
  it("prefers kcal (nutrient 208) directly", () => {
    const item = {
      fdcId: 111,
      description: "Chicken Breast",
      brandOwner: "Acme",
      servingSize: 140,
      servingSizeUnit: "g",
      foodNutrients: [
        { nutrientNumber: "208", unitName: "KCAL", value: 165 },
        { nutrientNumber: "203", value: 31 },
        { nutrientNumber: "204", value: 3.6 },
        { nutrientNumber: "205", value: 0 },
      ],
    };
    const out = mapUsdaFood(item);
    expect(out).toMatchObject({
      id: "usda_111",
      name: "Chicken Breast",
      brand: "Acme",
      source: "USDA",
      category: "Proteins",
      weight_amount: "100g",
      servingGrams: 140,
      calories: 165,
      protein: 31,
      fats: 4, // 3.6 rounded
      carbs: 0,
    });
  });

  it("falls back to kJ (268) converted by /4.184 when no kcal", () => {
    const item = {
      fdcId: 222,
      description: "Olive Oil",
      foodNutrients: [{ nutrientNumber: "268", unitName: "kJ", value: 3700 }],
    };
    // 3700 / 4.184 = 884.32... -> rounds to 884
    expect(mapUsdaFood(item).calories).toBe(Math.round(3700 / 4.184));
    expect(mapUsdaFood(item).calories).toBe(884);
  });

  it("detects kcal by unitName KCAL even without nutrient 208", () => {
    const item = {
      fdcId: 333,
      description: "Thing",
      foodNutrients: [{ nutrientNumber: "999", unitName: "kcal", value: 250 }],
    };
    expect(mapUsdaFood(item).calories).toBe(250);
  });

  it("defaults brand to Generic and only accepts g/ml serving units", () => {
    const item = {
      fdcId: 444,
      description: "Water",
      servingSize: 8,
      servingSizeUnit: "fl oz",
      foodNutrients: [],
    };
    const out = mapUsdaFood(item);
    expect(out.brand).toBe("Generic");
    expect(out.servingGrams).toBeNull();
    expect(out.calories).toBe(0);
  });
});

describe("mapOffProduct", () => {
  it("uses per-100g fields and off_ id prefix", () => {
    const item = {
      code: "555",
      product_name: "Protein Bar",
      brands: "BrandCo",
      serving_size: "60 g",
      nutriments: {
        "energy-kcal_100g": 380,
        proteins_100g: 20,
        fat_100g: 12,
        carbohydrates_100g: 40,
      },
    };
    expect(mapOffProduct(item)).toMatchObject({
      id: "off_555",
      name: "Protein Bar",
      brand: "BrandCo",
      source: "OFF",
      weight_amount: "100g",
      servingGrams: 60,
      calories: 380,
      protein: 20,
      fats: 12,
      carbs: 40,
    });
  });

  it("falls back to non-100g keys and default names", () => {
    const item = {
      code: "666",
      nutriments: { "energy-kcal": 100, proteins: 5, fat: 2, carbohydrates: 15 },
    };
    const out = mapOffProduct(item);
    expect(out.name).toBe("Unknown");
    expect(out.brand).toBe("OpenFoodFacts");
    expect(out.calories).toBe(100);
    expect(out.servingGrams).toBeNull();
  });
});

describe("mapBarcodeProduct", () => {
  it("maps an OFF product with Scan source and off_ id", () => {
    const p = {
      code: "777",
      product_name: "Cola",
      brands: "FizzCo",
      serving_size: "330 ml",
      nutriments: { "energy-kcal_100g": 42, proteins_100g: 0, carbohydrates_100g: 11, fat_100g: 0 },
    };
    expect(mapBarcodeProduct(p)).toMatchObject({
      id: "off_777",
      name: "Cola",
      brand: "FizzCo",
      source: "Scan 📸",
      weight_amount: "100g",
      calories: 42,
      protein: 0,
      carbs: 11,
      fats: 0,
      servingGrams: null, // "330 ml" has no grams
    });
  });
});

describe("searchUsda (with injected fetch)", () => {
  it("returns [] on non-OK", async () => {
    expect(await searchUsda("q", "key", jsonFetch({}, false))).toEqual([]);
  });
  it("returns [] when no foods", async () => {
    expect(await searchUsda("q", "key", jsonFetch({ foods: [] }))).toEqual([]);
  });
  it("maps foods", async () => {
    const body = { foods: [{ fdcId: 1, description: "Egg", foodNutrients: [{ nutrientNumber: "208", value: 70 }] }] };
    const out = await searchUsda("egg", "key", jsonFetch(body));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "usda_1", source: "USDA", calories: 70, category: "Proteins" });
  });
});

describe("searchOff (with injected fetch)", () => {
  it("maps products", async () => {
    const body = { products: [{ code: "9", product_name: "Milk", nutriments: { "energy-kcal_100g": 60 } }] };
    const out = await searchOff("milk", jsonFetch(body));
    expect(out[0]).toMatchObject({ id: "off_9", source: "OFF", category: "Dairy", calories: 60 });
  });
  it("returns [] on non-OK", async () => {
    expect(await searchOff("x", jsonFetch({}, false))).toEqual([]);
  });
});

describe("barcodeLookup (with injected fetch)", () => {
  it("maps a found product", async () => {
    const body = { status: 1, product: { code: "12", product_name: "Bar", nutriments: { "energy-kcal_100g": 400 } } };
    const out = await barcodeLookup("12", jsonFetch(body));
    expect(out).toMatchObject({ id: "off_12", source: "Scan 📸", calories: 400 });
  });
  it("returns null when not found", async () => {
    expect(await barcodeLookup("12", jsonFetch({ status: 0 }))).toBeNull();
  });
});

describe("handleFood orchestration", () => {
  it("returns [] for short queries", async () => {
    expect(await handleFood({ mode: "search", query: "a" }, {})).toEqual({ results: [] });
  });

  it("merges USDA + OFF results", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("nal.usda.gov")) {
        return { ok: true, json: async () => ({ foods: [{ fdcId: 1, description: "Egg", foodNutrients: [] }] }) };
      }
      return { ok: true, json: async () => ({ products: [{ code: "2", product_name: "Milk", nutriments: {} }] }) };
    };
    const out = await handleFood({ mode: "search", query: "breakfast" }, { USDA_API_KEY: "k" }, fetchImpl);
    expect(out.results.map((r) => r.id)).toEqual(["usda_1", "off_2"]);
  });

  it("barcode mode returns single product", async () => {
    const fetchImpl = jsonFetch({ status: 1, product: { code: "8", product_name: "Soda", nutriments: {} } });
    const out = await handleFood({ mode: "barcode", barcode: "8" }, {}, fetchImpl);
    expect(out.results).toHaveLength(1);
    expect(out.results[0].id).toBe("off_8");
  });

  it("barcode mode returns [] for empty/invalid barcode", async () => {
    const out = await handleFood({ mode: "barcode", barcode: "abc" }, {}, jsonFetch({}));
    expect(out).toEqual({ results: [] });
  });
});
