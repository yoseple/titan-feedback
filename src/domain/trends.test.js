import { describe, it, expect } from 'vitest';
import { weeklyCalories } from './trends';

describe('weeklyCalories', () => {
  it('returns 7 days oldest->newest ending today', () => {
    const w = weeklyCalories([], '2026-07-01');
    expect(w.length).toBe(7);
    expect(w[6].date).toBe('2026-07-01');
    expect(w[0].date).toBe('2026-06-25');
    expect(w.every((d) => d.calories === 0)).toBe(true);
  });
  it('sums calories per day and ignores other days', () => {
    const logs = [
      { date: '2026-07-01', calories: 500 },
      { date: '2026-07-01', calories: 300 },
      { date: '2026-06-30', calories: 200 },
      { date: '2026-01-01', calories: 999 }, // out of window
    ];
    const w = weeklyCalories(logs, '2026-07-01');
    expect(w[6].calories).toBe(800);
    expect(w[5].calories).toBe(200);
    expect(w.reduce((s, d) => s + d.calories, 0)).toBe(1000);
  });
});
