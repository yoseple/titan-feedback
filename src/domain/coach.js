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

// Last N turns as a compact transcript for conversational memory.
export const formatChatMemory = (history = [], n = 6) => {
  return history
    .filter((m) => m && m.content && m.role)
    .slice(-n)
    .map((m) => `${m.role === 'user' ? 'User' : 'Titan'}: ${String(m.content).slice(0, 300)}`)
    .join('\n');
};
