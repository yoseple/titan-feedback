import { describe, it, expect } from 'vitest';
import { deriveUserContext, formatUserContext, formatChatMemory } from './coach';

describe('deriveUserContext', () => {
  it('summarizes goal, latest weight, trend, and today intake', () => {
    const ctx = deriveUserContext({
      profile: { goal: 'cut', caloriesTarget: 2000, weight: 200, macroTargets: { protein: 200, carbs: 150, fats: 60 } },
      weightLog: [ { weight: 198, date: '2026-06-29' }, { weight: 200, date: '2026-06-22' } ], // newest first
      foodLogs: [ { date: '2026-06-30', calories: 500, protein: 40 }, { date: '2026-06-29', calories: 999, protein: 99 } ],
      today: '2026-06-30',
    });
    expect(ctx.goal).toBe('cut');
    expect(ctx.latestWeight).toBe(198);
    expect(ctx.weightTrendLbsPerWeek).toBe(-2); // -2 lb over 7 days
    expect(ctx.todayCalories).toBe(500);
    expect(ctx.todayProtein).toBe(40);
  });
  it('handles empty data gracefully', () => {
    const ctx = deriveUserContext({});
    expect(ctx.goal).toBe('maintenance');
    expect(ctx.weightTrendLbsPerWeek).toBe(null);
    expect(ctx.todayCalories).toBe(0);
  });
});

describe('formatUserContext', () => {
  it('renders a compact one-liner', () => {
    const s = formatUserContext({ goal: 'cut', latestWeight: 198, weightTrendLbsPerWeek: -2, caloriesTarget: 2000, macroTargets: { protein: 200, carbs: 150, fats: 60 }, todayCalories: 500, todayProtein: 40 });
    expect(s).toContain('goal=cut');
    expect(s).toContain('trend=-2lb/wk');
    expect(s).toContain('todaySoFar=500cal/40gP');
  });
});

describe('formatChatMemory', () => {
  it('keeps the last N turns only', () => {
    const hist = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'user' : 'ai', content: `m${i}` }));
    const mem = formatChatMemory(hist, 4);
    expect(mem.split('\n').length).toBe(4);
    expect(mem).toContain('m9');
    expect(mem).not.toContain('m5');
  });
});
