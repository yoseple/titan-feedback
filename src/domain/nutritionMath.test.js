import { describe, it, expect } from 'vitest';
import { calculateTDEE, calculateTargetCalories, computeMacroTargets, categorizeFood } from './nutritionMath';

describe('calculateTDEE (Mifflin–St Jeor)', () => {
  it('is a plausible value and male > female', () => {
    const male = calculateTDEE(180, 175, 25, 'male', 'moderate');
    const female = calculateTDEE(180, 175, 25, 'female', 'moderate');
    expect(male).toBeGreaterThan(2500);
    expect(male).toBeLessThan(3000);
    expect(male).toBeGreaterThan(female);
  });
  it('activity level is monotonic', () => {
    const s = calculateTDEE(180, 175, 25, 'male', 'sedentary');
    const a = calculateTDEE(180, 175, 25, 'male', 'active');
    expect(a).toBeGreaterThan(s);
  });
  it('survives garbage input with defaults', () => {
    expect(calculateTDEE('', '', '', 'x')).toBeGreaterThan(0);
  });
});

describe('calculateTargetCalories', () => {
  it('cut = -20% with a 1200 floor', () => {
    expect(calculateTargetCalories(2500, 'cut')).toBe(2000);
    expect(calculateTargetCalories(1000, 'cut')).toBe(1200);
  });
  it('bulk = +10%, maintenance unchanged', () => {
    expect(calculateTargetCalories(2500, 'bulk')).toBe(2750);
    expect(calculateTargetCalories(2500, 'maintenance')).toBe(2500);
  });
});

describe('computeMacroTargets', () => {
  it('macros reconstruct the calorie target (±10)', () => {
    const t = computeMacroTargets(2500, 'maintenance', 180);
    const kcal = t.protein * 4 + t.carbs * 4 + t.fats * 9;
    expect(Math.abs(kcal - 2500)).toBeLessThanOrEqual(10);
  });
  it('cut uses 1 g/lb protein', () => expect(computeMacroTargets(2000, 'cut', 180).protein).toBe(180));
  it('never negative carbs even at absurd inputs', () =>
    expect(computeMacroTargets(800, 'cut', 300).carbs).toBeGreaterThanOrEqual(0));
});

describe('categorizeFood', () => {
  it('buckets by keyword', () => {
    expect(categorizeFood('Grilled Chicken Breast')).toBe('Proteins');
    expect(categorizeFood('Banana')).toBe('Produce');
    expect(categorizeFood('White Rice')).toBe('Carbs');
    expect(categorizeFood('Cheddar Cheese')).toBe('Dairy');
    expect(categorizeFood('Something Odd')).toBe('Pantry');
  });
});
