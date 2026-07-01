import { describe, it, expect } from 'vitest';
import {
  basisFromSearchItem, buildFoodLog, basisFromLog, computeAmountMacros, convertQuantity, getPortions,
} from './foodMath';
import { computeMacroTargets, calculateTargetCalories } from './nutritionMath';
import { rankFoodResults } from './foodSearch';
import { deriveUserContext } from './coach';
import { getLocalDate } from '../utils/date';

// ---------------------------------------------------------------------------
// Expected-vs-actual scenario table (printed to the test console)
// ---------------------------------------------------------------------------
const rows = [];
const scenario = (name, expected, actual) => {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  rows.push({ name, expected: e, actual: a, result: e === a ? 'PASS' : 'FAIL' });
  return e === a;
};

describe('STRESS — expected vs actual (representative scenarios)', () => {
  it('every scenario matches its expected behavior', () => {
    // 1. Per-100g food: log 250 g of a 200 kcal/100g food
    {
      const b = basisFromSearchItem({ calories: 200, protein: 20, carbs: 10, fats: 5, weight_amount: '100g' });
      scenario('Log 250 g of 200kcal/100g food', 500, computeAmountMacros(b, 250, 'g').calories);
    }
    // 2. Serving food: log 2 servings of a 300 kcal/serving AI food
    {
      const b = basisFromSearchItem({ calories: 300, weight_amount: '1 serving' });
      scenario('Log 2 servings of 300kcal/serving food', 600, computeAmountMacros(b, 2, 'serving').calories);
    }
    // 3. B02/B03 regression: re-edit a 2-serving log 3x -> stays 400 (no doubling)
    {
      const b = basisFromSearchItem({ calories: 200, weight_amount: '100g' });
      let log = buildFoodLog(b, 2, 'serving', { name: 'x' });
      for (let i = 0; i < 3; i++) { const bb = basisFromLog(log); log = buildFoodLog(bb, bb.quantity, bb.unit, { name: 'x' }); }
      scenario('Re-edit 2-serving log x3 (no doubling)', 400, log.calories);
    }
    // 4. Legacy V1 "2 x 100g" (stored total 400) edits to 400, not 800
    {
      const b = basisFromLog({ calories: 400, weight_amount: '2 x 100g' });
      scenario('Legacy V1 "2 x 100g" re-edit', 400, computeAmountMacros(b, b.quantity, b.unit).calories);
    }
    // 5. B04 regression handled at adapter: per-100g 89 kcal food logs 89 for 100 g
    {
      const b = basisFromSearchItem({ calories: 89, weight_amount: '100g' });
      scenario('Banana 89kcal/100g logs 89 for 100g', 89, computeAmountMacros(b, 100, 'g').calories);
    }
    // 6. Portion chip: 45 g serving of a 550 kcal/100g bar
    {
      const chips = getPortions({ weight_amount: '100g', servingGrams: 45 });
      const b = basisFromSearchItem({ calories: 550, weight_amount: '100g' });
      scenario('Portion chip 45g of 550kcal/100g', 248, computeAmountMacros(b, chips[0].quantity, chips[0].unit).calories);
    }
    // 7. Unit conversion: 200 g -> oz -> g round-trips (base 100g)
    {
      const oz = convertQuantity(200, 'g', 'oz', 100);
      scenario('200 g -> oz -> g round-trip', 200, convertQuantity(oz, 'oz', 'g', 100));
    }
    // 8. Macro targets reconstruct calories for a 2500 kcal cut
    {
      const t = computeMacroTargets(2500, 'cut', 180);
      const kcal = t.protein * 4 + t.carbs * 4 + t.fats * 9;
      scenario('Macro targets reconstruct ~2500 (±10)', true, Math.abs(kcal - 2500) <= 10);
    }
    // 9. Cut target = TDEE * 0.8
    scenario('Cut calorie target of 2500 TDEE', 2000, calculateTargetCalories(2500, 'cut'));
    // 10. Search ranking: exact USDA match first
    {
      const ranked = rankFoodResults(
        [{ name: 'Chicken Soup', calories: 50, source: 'OFF' }, { name: 'Chicken', calories: 165, source: 'USDA' }],
        'chicken',
      );
      scenario('Search ranks exact USDA match first', 'Chicken/USDA', `${ranked[0].name}/${ranked[0].source}`);
    }
    // 11. Coach context: -2 lb/week trend
    {
      const ctx = deriveUserContext({
        weightLog: [{ weight: 198, date: '2026-06-29' }, { weight: 200, date: '2026-06-22' }],
        today: '2026-06-30',
      });
      scenario('Coach derives -2 lb/week trend', -2, ctx.weightTrendLbsPerWeek);
    }
    // 12. Local date format
    scenario('getLocalDate format', true, /^\d{4}-\d{2}-\d{2}$/.test(getLocalDate(new Date('2026-06-30T12:00:00'))));

    // Print the table
    const pass = rows.filter((r) => r.result === 'PASS').length;
    const line = '-'.repeat(96);
    let out = `\n\n=== TITAN STRESS TEST — EXPECTED vs ACTUAL ===\n${line}\n`;
    out += 'SCENARIO'.padEnd(46) + 'EXPECTED'.padEnd(18) + 'ACTUAL'.padEnd(18) + 'RESULT\n' + line + '\n';
    for (const r of rows) {
      out += r.name.slice(0, 45).padEnd(46) + r.expected.slice(0, 17).padEnd(18) + r.actual.slice(0, 17).padEnd(18) + r.result + '\n';
    }
    out += `${line}\nRESULT: ${pass}/${rows.length} scenarios matched expected behavior.\n`;
    // eslint-disable-next-line no-console
    console.log(out);

    expect(rows.every((r) => r.result === 'PASS')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fuzz / property invariants (1000s of randomized cases)
// ---------------------------------------------------------------------------
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];

describe('STRESS — fuzz invariants', () => {
  it('1000 random log→edit×3 round-trips stay stable, never NaN/negative', () => {
    let drift = 0, bad = 0;
    for (let iter = 0; iter < 1000; iter++) {
      const item = {
        name: `f${iter}`,
        calories: rnd(900) + 1, protein: rnd(80), carbs: rnd(120), fats: rnd(60),
        weight_amount: pick(['100g', '1 serving', `${rnd(200) + 1} g`, '1 cup (158g)', '4 oz']),
      };
      const basis = basisFromSearchItem(item);
      const unit = basis.gramScalable ? pick(['g', 'g', 'oz', 'serving']) : 'serving';
      const qty = basis.gramScalable && unit !== 'serving' ? rnd(300) + 1 : rnd(3) + 1;

      let log = buildFoodLog(basis, qty, unit, { name: item.name });
      const first = log.calories;
      for (const k of ['calories', 'protein', 'carbs', 'fats']) {
        if (Number.isNaN(log[k]) || log[k] < 0) bad++;
      }
      for (let e = 0; e < 3; e++) { const b = basisFromLog(log); log = buildFoodLog(b, b.quantity, b.unit, { name: item.name }); }
      if (log.calories !== first) drift++;
    }
    expect(bad).toBe(0);
    expect(drift).toBe(0);
  });

  it('gram scaling is proportional (2× grams ⇒ ~2× macros)', () => {
    for (let i = 0; i < 300; i++) {
      const b = basisFromSearchItem({ calories: rnd(500) + 50, weight_amount: '100g' });
      const a1 = computeAmountMacros(b, 100, 'g').calories;
      const a2 = computeAmountMacros(b, 200, 'g').calories;
      expect(Math.abs(a2 - a1 * 2)).toBeLessThanOrEqual(1);
    }
  });

  it('500 random macro-target profiles stay non-negative and reconstruct calories', () => {
    let bad = 0;
    for (let i = 0; i < 500; i++) {
      const cals = rnd(3000) + 800;
      const t = computeMacroTargets(cals, pick(['cut', 'bulk', 'maintenance']), rnd(200) + 90);
      if (t.protein < 0 || t.carbs < 0 || t.fats < 0) bad++;
      if (t.carbs > 0) {
        const kcal = t.protein * 4 + t.carbs * 4 + t.fats * 9;
        if (Math.abs(kcal - cals) > 6) bad++;
      }
    }
    expect(bad).toBe(0);
  });
});
