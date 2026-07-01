import { describe, it, expect } from 'vitest';
import { deriveUserContext, formatUserContext, formatChatMemory, parseCoachAction, normalizeDayId } from './coach';

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

describe('normalizeDayId', () => {
  it('normalizes day names + aliases', () => {
    expect(normalizeDayId('Monday')).toBe('monday');
    expect(normalizeDayId('WED')).toBe('wednesday');
    expect(normalizeDayId('tues')).toBe('tuesday');
    expect(normalizeDayId(null)).toBe(null);
  });
});

describe('parseCoachAction — validates + bounds untrusted AI output', () => {
  it('parses a valid update_plan and normalizes the day id', () => {
    const a = parseCoachAction({ type: 'update_plan', updates: [{ day: 'Monday', focus: 'Chest', exercises: [{ name: 'Bench', sets: '4', reps: '8', type: 'weighted' }] }] });
    expect(a.type).toBe('update_plan');
    expect(a.updates[0].id).toBe('monday');
    expect(a.updates[0].exercises.length).toBe(1);
    expect(a.preview).toContain('Chest');
  });
  it('parses a valid add_meal and clamps macros', () => {
    const a = parseCoachAction({ type: 'add_meal', data: { name: 'X', calories: 650, protein: 55, carbs: 45, fats: 22, ingredients: [{ name: 'Egg' }] } });
    expect(a.type).toBe('add_meal');
    expect(a.meal.calories).toBe(650);
    expect(a.preview).toContain('650 cal');
  });
  it('falls back to advice for malformed / empty input', () => {
    expect(parseCoachAction(null).type).toBe('advice');
    expect(parseCoachAction({}).type).toBe('advice');
    expect(parseCoachAction({ type: 'update_plan', updates: [] }).type).toBe('advice');
    expect(parseCoachAction({ type: 'advice', message: 'hi' })).toEqual({ type: 'advice', message: 'hi' });
  });
  it('clamps absurd numbers and drops junk exercises', () => {
    const a = parseCoachAction({ type: 'add_meal', data: { name: 'Y', calories: 9e9, protein: -50 } });
    expect(a.meal.calories).toBe(10000); // clamped
    expect(a.meal.protein).toBe(0);      // negatives floored
    const p = parseCoachAction({ type: 'update_plan', updates: [{ day: 'Mon', exercises: [{ name: '' }, { name: 'Row', type: 'evil' }] }] });
    expect(p.updates[0].exercises.length).toBe(1);        // nameless dropped
    expect(p.updates[0].exercises[0].type).toBe('weighted'); // bad type -> default
  });
  it('caps array + string lengths (runaway output / injection)', () => {
    const a = parseCoachAction({ type: 'update_plan', updates: Array.from({ length: 50 }, () => ({ day: 'monday', exercises: Array.from({ length: 99 }, (_, i) => ({ name: `e${i}` })) })) });
    expect(a.updates.length).toBeLessThanOrEqual(7);
    expect(a.updates[0].exercises.length).toBeLessThanOrEqual(12);
    const m = parseCoachAction({ type: 'add_meal', data: { name: 'z'.repeat(500), instructions: 'i'.repeat(5000), ingredients: Array.from({ length: 99 }, () => ({ name: 'a' })) } });
    expect(m.meal.name.length).toBeLessThanOrEqual(80);
    expect(m.meal.instructions.length).toBeLessThanOrEqual(2000);
    expect(m.meal.ingredients.length).toBeLessThanOrEqual(30);
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
