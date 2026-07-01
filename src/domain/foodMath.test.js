import { describe, it, expect } from 'vitest';
import {
  parseGramsFromLabel,
  toGrams,
  scaleMacros,
  computeAmountMacros,
  basisFromSearchItem,
  basisFromItem,
  basisFromLog,
  buildFoodLog,
  displayAmount,
  convertQuantity,
} from './foodMath';

describe('parseGramsFromLabel', () => {
  it('parses gram forms and returns null for serving-only labels', () => {
    expect(parseGramsFromLabel('100g')).toBe(100);
    expect(parseGramsFromLabel('1 cup (158g)')).toBe(158);
    expect(Math.round(parseGramsFromLabel('4 oz'))).toBe(113);
    expect(parseGramsFromLabel('1 serving')).toBe(null);
    expect(parseGramsFromLabel('')).toBe(null);
    expect(parseGramsFromLabel(undefined)).toBe(null);
  });
});

describe('toGrams / scaleMacros', () => {
  it('converts weight units', () => {
    expect(toGrams(100, 'g')).toBe(100);
    expect(Math.round(toGrams(1, 'oz'))).toBe(28);
    expect(Math.round(toGrams(1, 'floz'))).toBe(30);
  });
  it('scales macros by a factor', () => {
    expect(scaleMacros({ calories: 200, protein: 20, carbs: 10, fats: 5 }, 0.5)).toEqual({
      calories: 100, protein: 10, carbs: 5, fats: 3,
    });
  });
});

describe('computeAmountMacros — per-100g food', () => {
  const basis = basisFromSearchItem({ calories: 200, protein: 20, carbs: 10, fats: 5, weight_amount: '100g' });
  it('is gram scalable', () => expect(basis.gramScalable).toBe(true));
  it('100 g -> base', () => expect(computeAmountMacros(basis, 100, 'g').calories).toBe(200));
  it('250 g -> 2.5x', () => expect(computeAmountMacros(basis, 250, 'g').calories).toBe(500));
  it('50 g -> 0.5x', () => expect(computeAmountMacros(basis, 50, 'g').calories).toBe(100));
  it('1 serving == 100 g', () => expect(computeAmountMacros(basis, 1, 'serving').calories).toBe(200));
});

describe('serving-only food (AI estimate, no grams)', () => {
  const basis = basisFromSearchItem({ calories: 300, protein: 25, carbs: 30, fats: 10, weight_amount: '1 serving' });
  it('is NOT gram scalable', () => expect(basis.gramScalable).toBe(false));
  it('2 servings -> 2x (never the ~100x blow-up, B06)', () =>
    expect(computeAmountMacros(basis, 2, 'serving').calories).toBe(600));
});

describe('B02/B03 — re-editing a serving log never doubles', () => {
  const basis = basisFromSearchItem({ calories: 200, protein: 0, carbs: 0, fats: 0, weight_amount: '100g' });
  const log = buildFoodLog(basis, 2, 'serving', { name: 'Chicken' });

  it('logs 2 servings = 400', () => expect(log.calories).toBe(400));
  it('stores an immutable base, not the scaled total', () => expect(log.base.calories).toBe(200));

  it('re-edit -> still 400 (no doubling), and label does not compound', () => {
    const b2 = basisFromLog(log);
    expect(computeAmountMacros(b2, b2.quantity, b2.unit).calories).toBe(400);
    const log2 = buildFoodLog(b2, b2.quantity, b2.unit, { name: 'Chicken' });
    expect(log2.calories).toBe(400);
    expect(log2.weight_amount).not.toMatch(/x .* x /); // no "2 x 2 x 100g"
  });
});

describe('legacy V1 logs stay correct on edit', () => {
  it('V1 serving log "2 x 100g" (totals already scaled) recovers base 200, recompute 400 not 800', () => {
    const v1 = { calories: 400, protein: 0, carbs: 0, fats: 0, weight_amount: '2 x 100g' };
    const b = basisFromLog(v1);
    expect(b.base.calories).toBe(200);
    expect(computeAmountMacros(b, b.quantity, b.unit).calories).toBe(400);
  });
  it('V1 gram log "316 g" edits proportionally (158 g -> half)', () => {
    const v1 = { calories: 316, protein: 0, carbs: 0, fats: 0, weight_amount: '316 g' };
    const b = basisFromLog(v1);
    expect(computeAmountMacros(b, 158, 'g').calories).toBe(158);
  });
});

describe('unit conversion keeps grams constant (and never balloons servings)', () => {
  it('100 g <-> 1 serving for a 100g base', () => {
    expect(convertQuantity(100, 'g', 'serving', 100)).toBe(1);
    expect(convertQuantity(1, 'serving', 'g', 100)).toBe(100);
  });
  it('to-serving with unknown base collapses to 1 (not the raw gram count)', () => {
    expect(convertQuantity(250, 'g', 'serving', null)).toBe(1);
  });
});

describe('basisFromItem — re-logging a stored item uses its immutable base', () => {
  it('serving-only V2 item re-logs at the per-serving base, not the prior total', () => {
    // AI food: base 300/serving, previously logged as 2 servings (total 600).
    const stored = buildFoodLog(
      basisFromSearchItem({ calories: 300, protein: 0, carbs: 0, fats: 0, weight_amount: '1 serving' }),
      2, 'serving', { name: 'AI Meal' },
    );
    expect(stored.calories).toBe(600);
    const basis = basisFromItem(stored);
    // re-log defaults to 1 serving -> 300, NOT 600
    expect(computeAmountMacros(basis, 1, 'serving').calories).toBe(300);
  });
  it('falls back to weight_amount for a plain search item', () => {
    const basis = basisFromItem({ calories: 200, protein: 0, carbs: 0, fats: 0, weight_amount: '100g' });
    expect(basis.gramScalable).toBe(true);
    expect(computeAmountMacros(basis, 100, 'g').calories).toBe(200);
  });
});

describe('displayAmount', () => {
  it('renders servings with resolved grams', () => {
    expect(displayAmount(2, 'serving', 100)).toBe('2 servings (200 g)');
    expect(displayAmount(1, 'serving', null)).toBe('1 serving');
    expect(displayAmount(150, 'g', 100)).toBe('150 g');
  });
});
