import { describe, it, expect } from 'vitest';
import { rankFoodResults, dedupeResults } from './foodSearch';

const results = [
  { name: 'Chicken Soup', calories: 50, source: 'OFF' },
  { name: 'Chicken', calories: 165, source: 'USDA' },
  { name: 'Fried Chicken Wing', calories: 300, source: 'OFF' },
  { name: 'Chicken', calories: 0, source: 'OFF' },
];

describe('rankFoodResults', () => {
  it('ranks the exact match from the best source first', () => {
    const ranked = rankFoodResults(results, 'chicken');
    expect(ranked[0].name).toBe('Chicken');
    expect(ranked[0].source).toBe('USDA');
  });
  it('sinks 0-kcal / missing-energy rows to the bottom', () => {
    const ranked = rankFoodResults(results, 'chicken');
    expect(ranked[ranked.length - 1].calories).toBe(0);
  });
});

describe('dedupeResults', () => {
  it('removes same-name (case-insensitive) + same-calorie duplicates', () => {
    const out = dedupeResults([{ name: 'Egg', calories: 70 }, { name: 'egg', calories: 70 }, { name: 'Egg', calories: 90 }]);
    expect(out.length).toBe(2);
  });
});
