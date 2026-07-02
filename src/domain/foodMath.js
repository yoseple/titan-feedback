// src/domain/foodMath.js
// Pure, unit-tested food math — the single source of truth for parsing amounts,
// converting units, and computing logged macros from an IMMUTABLE basis.
//
// The core idea (Wave 2): a food's macros are stored as an immutable "basis"
// (macros for `baseGrams` grams, or for one serving when grams are unknown) plus
// the user's chosen quantity + unit. Totals are ALWAYS recomputed from the basis,
// so re-editing/rescaling is exact and never compounds (the root fix for the
// serving-multiplier bug class B02/B03/B06).

export const OZ_TO_G = 28.3495;
export const FLOZ_TO_G = 29.5735;

// Coerce a macro value ("12g", 12, "12.4") to a number. Numbers pass through.
export const cleanMacro = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const match = val.toString().match(/(\d+(\.\d+)?)/);
  return match ? Math.round(parseFloat(match[0])) : 0;
};

// Grams from a weight label: "1 cup (158g)" -> 158, "100g" -> 100, "4 oz" -> ~113.4, else null.
export const parseGramsFromLabel = (weightStr) => {
  if (!weightStr) return null;
  const str = weightStr.toString().toLowerCase().trim();
  const paren = str.match(/\((\d+(\.\d+)?)\s*g\)/);
  if (paren) return parseFloat(paren[1]);
  const gram = str.match(/^(\d+(\.\d+)?)\s*g/);
  if (gram) return parseFloat(gram[1]);
  const oz = str.match(/^(\d+(\.\d+)?)\s*oz/);
  if (oz) return parseFloat(oz[1]) * OZ_TO_G;
  return null;
};
// Back-compat alias for the old name.
export const getBaseGramWeight = parseGramsFromLabel;

// Convert a weight quantity to grams. (Servings are handled by the basis, not here.)
export const toGrams = (quantity, unit) => {
  const q = Number(quantity) || 0;
  if (unit === 'oz') return q * OZ_TO_G;
  if (unit === 'floz') return q * FLOZ_TO_G;
  return q; // 'g' (and any fallback)
};

export const scaleMacros = (base, factor) => ({
  calories: Math.round((base.calories || 0) * factor),
  protein: Math.round((base.protein || 0) * factor),
  carbs: Math.round((base.carbs || 0) * factor),
  fats: Math.round((base.fats || 0) * factor),
});

// Normalize the various macro field spellings to {calories,protein,carbs,fats}.
export const normalizeMacros = (item) => ({
  calories: cleanMacro(item.calories ?? item.kcal ?? item.energy),
  protein: cleanMacro(item.protein ?? item.prot ?? item.proteins),
  carbs: cleanMacro(item.carbs ?? item.carb ?? item.carbohydrates ?? item.carbohydrate),
  fats: cleanMacro(item.fats ?? item.fat ?? item.lipid ?? item.lipids),
});

// Normalize a food item (and any nested ingredients) — used by the recipe editor + AI meals.
export const normalizeFoodData = (item) => {
  const m = normalizeMacros(item);
  const cleanItem = {
    ...item,
    ...m,
    weight_amount: item.weight || item.weight_amount || item.amount || '1 serving',
  };

  if (cleanItem.ingredients && Array.isArray(cleanItem.ingredients)) {
    cleanItem.ingredients = cleanItem.ingredients.map((ing) => ({
      ...ing,
      ...normalizeMacros(ing),
      weight: ing.weight || ing.weight_amount || '1 serving',
    }));

    if (cleanItem.calories === 0) {
      const t = cleanItem.ingredients.reduce(
        (acc, ing) => ({
          calories: acc.calories + ing.calories,
          protein: acc.protein + ing.protein,
          carbs: acc.carbs + ing.carbs,
          fats: acc.fats + ing.fats,
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0 },
      );
      Object.assign(cleanItem, t);
    }
  }
  return cleanItem;
};

// Convert an amount between units (g/oz/floz/serving), keeping grams constant.
// baseWeightInGrams = grams per serving (needed for any serving<->weight conversion).
export const convertQuantity = (amount, fromUnit, toUnit, baseWeightInGrams) => {
  let grams = 0;
  if (fromUnit === 'g') grams = Number(amount) || 0;
  else if (fromUnit === 'oz') grams = (Number(amount) || 0) * OZ_TO_G;
  else if (fromUnit === 'floz') grams = (Number(amount) || 0) * FLOZ_TO_G;
  else if (fromUnit === 'serving') {
    if (!baseWeightInGrams) return Number(amount) || 0;
    grams = (Number(amount) || 0) * baseWeightInGrams;
  }

  if (toUnit === 'g') return Math.round(grams);
  if (toUnit === 'oz') return parseFloat((grams / OZ_TO_G).toFixed(2));
  if (toUnit === 'floz') return parseFloat((grams / FLOZ_TO_G).toFixed(2));
  if (toUnit === 'serving') {
    if (!baseWeightInGrams) return 1; // unknown serving size -> 1 serving (never carry the gram count)
    return parseFloat((grams / baseWeightInGrams).toFixed(2));
  }
  return Number(amount) || 0;
};

// ---------------------------------------------------------------------------
// BASIS MODEL
// A basis = { base:{calories,protein,carbs,fats}, baseGrams:number|null, gramScalable:boolean }
//   - gramScalable: base is macros for `baseGrams` grams (weight-scalable).
//   - !gramScalable: base is macros for ONE serving (baseGrams null; serving-only).
// ---------------------------------------------------------------------------

// Build a basis from a fresh search/adapter item (macros correspond to weight_amount).
export const basisFromSearchItem = (item) => {
  const base = normalizeMacros(item);
  const baseGrams = parseGramsFromLabel(item.weight_amount);
  return { base, baseGrams, gramScalable: baseGrams != null };
};

// Build a basis for LOGGING an item. Prefers a stored immutable base (V2 items from
// history / saved logs) so re-logging uses the true per-unit base, not a prior scaled
// total; otherwise derives it from the item's weight_amount.
export const basisFromItem = (item) => {
  if (item && item.base && (item.schemaVersion || 0) >= 2) {
    const baseGrams = item.baseGrams ?? null;
    return { base: { ...item.base }, baseGrams, gramScalable: baseGrams != null };
  }
  return basisFromSearchItem(item);
};

// Reconstruct a basis from a stored food_log. Handles the new immutable V2 schema
// AND legacy V1 logs (which stored already-scaled totals + a label string).
export const basisFromLog = (log) => {
  // V2: immutable basis stored directly — trivial + exact.
  if (log && log.base && (log.schemaVersion || 0) >= 2) {
    return {
      base: { ...log.base },
      baseGrams: log.baseGrams ?? null,
      gramScalable: log.baseGrams != null,
      quantity: Number(log.quantity) || 1,
      unit: log.unit || 'serving',
    };
  }

  // V1 legacy: reverse-engineer the per-unit base from totals + the label (once).
  const totals = normalizeMacros(log);
  const label = (log.weight_amount || '').toString();
  const m = label.match(/^(\d+(\.\d+)?)\s*(.*)$/);
  const quantity = m ? parseFloat(m[1]) : 1;
  const textPart = m ? m[3].toLowerCase().trim() : '';

  let unit = 'serving';
  let base = totals;
  let baseGrams = null;

  if (textPart === 'g' || textPart === 'grams') { unit = 'g'; baseGrams = toGrams(quantity, 'g'); }
  else if (textPart === 'oz' || textPart === 'ounces') { unit = 'oz'; baseGrams = toGrams(quantity, 'oz'); }
  else if (textPart === 'floz' || textPart === 'fl oz') { unit = 'floz'; baseGrams = toGrams(quantity, 'floz'); }
  else if (textPart.startsWith('x ')) {
    // serving-format "N x <baseLabel>": totals were already scaled by N -> divide back.
    unit = 'serving';
    const div = quantity > 0 ? quantity : 1;
    base = scaleMacros(totals, 1 / div);
    baseGrams = parseGramsFromLabel(textPart.slice(2).trim());
  }
  // else: bare number / unknown -> treat as servings of the whole item.

  return {
    base,
    baseGrams,
    gramScalable: baseGrams != null,
    quantity: quantity > 0 ? quantity : 1,
    unit,
  };
};

// Portion presets ("chips") for the log modal, derived from the item's base + servingGrams.
// Each chip sets a { quantity, unit }. Gram-scalable foods get an accurate "1 serving (N g)"
// chip when the source gives a serving size, plus 100 g / 1 oz; serving-only foods get servings.
export const getPortions = (item) => {
  const baseGrams = parseGramsFromLabel(item.weight_amount);
  const sg = Number(item.servingGrams) || null;
  if (!baseGrams) {
    return [
      { label: '1 serving', quantity: 1, unit: 'serving' },
      { label: '2 servings', quantity: 2, unit: 'serving' },
    ];
  }
  const chips = [];
  if (sg) chips.push({ label: `1 serving (${Math.round(sg)} g)`, quantity: Math.round(sg), unit: 'g' });
  chips.push({ label: '100 g', quantity: 100, unit: 'g' });
  chips.push({ label: '1 oz', quantity: 1, unit: 'oz' });
  return chips;
};

// Compute consumed macros for a basis + amount.
export const computeAmountMacros = (basis, quantity, unit) => {
  if (!basis) return { calories: 0, protein: 0, carbs: 0, fats: 0 };
  let factor;
  if (unit === 'serving' || !basis.gramScalable || basis.baseGrams == null) {
    factor = Number(quantity) || 0; // one "serving" = the whole base
  } else {
    factor = toGrams(quantity, unit) / basis.baseGrams;
  }
  return scaleMacros(basis.base, factor);
};

// Human-readable amount label for display (and legacy readers).
export const displayAmount = (quantity, unit, baseGrams) => {
  const q = Number(quantity) || 0;
  if (unit === 'serving') {
    const s = q === 1 ? '' : 's';
    return baseGrams ? `${q} serving${s} (${Math.round(q * baseGrams)} g)` : `${q} serving${s}`;
  }
  const label = unit === 'floz' ? 'fl oz' : unit;
  return `${q} ${label}`;
};

// ---------------------------------------------------------------------------
// LOG-WRITE ROUTING
// Whether a confirmed food review EDITS an existing log or CREATES a new one is
// driven ONLY by an explicit marker (__editingLogId) set on the true edit path
// (useFoodLogging.handleEditLog). Items picked from Recent (food_history), Saved
// (custom_meals) and Popular/Cached (food_cache) carry plain Firestore auto-ids
// too, so inferring "edit" from the id misrouted them to an update on a foreign /
// non-existent food_logs doc and silently lost the log. Returns the log id to edit
// in place, or null to create a new log.
export const getEditingLogId = (scannedResult) => scannedResult?.__editingLogId || null;

// Build a V2 food_log document (immutable basis + amount + denormalized totals).
export const buildFoodLog = (basis, quantity, unit, extra = {}) => {
  const totals = computeAmountMacros(basis, quantity, unit);
  return {
    ...extra,
    base: basis.base,
    baseGrams: basis.baseGrams ?? null,
    unit,
    quantity: Number(quantity) || 0,
    ...totals,
    weight_amount: displayAmount(quantity, unit, basis.baseGrams),
    schemaVersion: 2,
  };
};
