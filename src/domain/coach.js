// src/domain/coach.js
// Pure helpers that build a compact, factual snapshot of THIS user to ground the AI
// coach (so advice is personalized instead of generic), plus recent chat memory.
import { getLocalDate } from '../utils/date';

const daysBetween = (a, b) => {
  const da = new Date(a), db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return Math.round((db - da) / 86400000);
};

export const deriveUserContext = ({ profile = {}, weightLog = [], foodLogs = [], today = getLocalDate() } = {}) => {
  const goal = profile.goal || 'maintenance';
  const caloriesTarget = profile.caloriesTarget || null;
  const macroTargets = profile.macroTargets || null;

  const weights = (weightLog || []).filter((w) => w && w.weight != null && w.date);
  const latestWeight = weights.length ? Number(weights[0].weight) : (profile.weight ? Number(profile.weight) : null);

  // weightLog is ordered newest-first (see useTitanData). Estimate lb/week slope.
  let weightTrendLbsPerWeek = null;
  if (weights.length >= 2) {
    const newest = weights[0];
    const oldest = weights[weights.length - 1];
    const days = daysBetween(oldest.date, newest.date);
    if (days > 0) weightTrendLbsPerWeek = Math.round(((newest.weight - oldest.weight) / days) * 7 * 10) / 10;
  }

  const todays = (foodLogs || []).filter((f) => f && f.date === today);
  const todayCalories = todays.reduce((s, f) => s + (f.calories || 0), 0);
  const todayProtein = todays.reduce((s, f) => s + (f.protein || 0), 0);

  return { goal, caloriesTarget, macroTargets, latestWeight, weightTrendLbsPerWeek, todayCalories, todayProtein };
};

// One-line summary of the context for the model prompt.
export const formatUserContext = (ctx) => {
  if (!ctx) return '';
  const parts = [`goal=${ctx.goal}`];
  if (ctx.latestWeight != null) parts.push(`weight=${ctx.latestWeight}lb`);
  if (ctx.weightTrendLbsPerWeek != null) parts.push(`trend=${ctx.weightTrendLbsPerWeek >= 0 ? '+' : ''}${ctx.weightTrendLbsPerWeek}lb/wk`);
  if (ctx.caloriesTarget) parts.push(`calorieTarget=${ctx.caloriesTarget}`);
  if (ctx.macroTargets) parts.push(`macroTargets P/C/F=${ctx.macroTargets.protein}/${ctx.macroTargets.carbs}/${ctx.macroTargets.fats}`);
  parts.push(`todaySoFar=${ctx.todayCalories}cal/${ctx.todayProtein}gP`);
  return parts.join(', ');
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_ALIASES = {
  mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday', weds: 'wednesday',
  thu: 'thursday', thur: 'thursday', thurs: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday',
};
export const normalizeDayId = (input) => {
  if (!input) return null;
  const lower = String(input).toLowerCase().trim();
  if (DAYS.includes(lower)) return lower;
  return DAY_ALIASES[lower] || lower;
};

const clampNum = (v) => Math.max(0, Math.min(10000, Math.round(Number(v) || 0)));
const str = (v, max) => String(v ?? '').slice(0, max);

// Validate + normalize the AI's raw JSON into a SAFE, bounded action descriptor with a
// human preview. Never trusts the model: allowlists type/exercise-type, clamps numbers,
// caps array + string lengths (also hardens prompt-injection / runaway output, B25).
export const parseCoachAction = (data) => {
  if (!data || typeof data !== 'object') return { type: 'advice', message: 'Sorry, I did not get that.' };

  if (data.type === 'update_plan') {
    const updates = (Array.isArray(data.updates) ? data.updates : []).slice(0, 7).map((u) => ({
      id: normalizeDayId(u.id || u.day),
      day: str(u.day, 20),
      focus: str(u.focus, 60),
      exercises: (Array.isArray(u.exercises) ? u.exercises : []).slice(0, 12).map((ex) => ({
        name: str(ex.name, 60),
        sets: str(ex.sets, 10),
        reps: str(ex.reps, 15),
        tips: str(ex.tips, 80),
        type: ['weighted', 'bodyweight', 'cardio'].includes(ex.type) ? ex.type : 'weighted',
      })).filter((ex) => ex.name),
    })).filter((u) => u.id);
    if (!updates.length) return { type: 'advice', message: "I couldn't build a valid plan update." };
    const preview = updates.map((u) => `${(u.day || u.id)} — ${u.focus || 'Workout'} (${u.exercises.length} exercises)`).join('\n');
    return { type: 'update_plan', updates, preview };
  }

  if (data.type === 'add_meal') {
    const d = data.data || {};
    const meal = {
      name: str(d.name || 'Titan Meal', 80),
      calories: clampNum(d.calories), protein: clampNum(d.protein), carbs: clampNum(d.carbs), fats: clampNum(d.fats),
      ingredients: (Array.isArray(d.ingredients) ? d.ingredients : []).slice(0, 30),
      instructions: str(d.instructions, 2000),
      tags: [],
    };
    const preview = `${meal.name} — ${meal.calories} cal · ${meal.protein}P / ${meal.carbs}C / ${meal.fats}F · ${meal.ingredients.length} ingredients`;
    return { type: 'add_meal', meal, preview };
  }

  return { type: 'advice', message: str(data.message || 'Done.', 4000) };
};

// Last N turns as a compact transcript for conversational memory.
export const formatChatMemory = (history = [], n = 6) => {
  return history
    .filter((m) => m && m.content && m.role)
    .slice(-n)
    .map((m) => `${m.role === 'user' ? 'User' : 'Titan'}: ${String(m.content).slice(0, 300)}`)
    .join('\n');
};
