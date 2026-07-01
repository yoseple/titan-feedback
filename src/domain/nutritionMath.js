// src/domain/nutritionMath.js
// Pure nutrition math (no Firebase) — extracted from utils/nutrition.js so it can be
// unit-/stress-tested and imported anywhere. utils/nutrition.js re-exports these.

export const categorizeFood = (text) => {
  const t = (text || '').toLowerCase();
  if (t.match(/beef|chicken|turkey|pork|fish|salmon|tuna|egg|tofu|steak|whey|meat|sausage|bacon|burger|shrimp|protein/)) return 'Proteins';
  if (t.match(/spinach|kale|lettuce|apple|banana|berry|vegetable|fruit|onion|tomato|produce|potato|avocado|cucumber|pepper/)) return 'Produce';
  if (t.match(/milk|yogurt|cheese|butter|cream/)) return 'Dairy';
  if (t.match(/rice|pasta|bread|oat|grain|flour|noodle|bagel|bun|wrap|tortilla/)) return 'Carbs';
  if (t.match(/chip|cracker|cookie|bar|snack|chocolate/)) return 'Snacks';
  return 'Pantry';
};

// Mifflin–St Jeor TDEE from imperial weight + metric height.
export const calculateTDEE = (weightLbs, heightCm, age, gender, activityLevel = 'moderate') => {
  const weightKg = (parseFloat(weightLbs) || 180) * 0.45359237;
  const height = parseFloat(heightCm) || 175;
  const ageVal = parseFloat(age) || 25;
  let bmr = (10 * weightKg) + (6.25 * height) - (5 * ageVal);
  if (gender === 'female') bmr -= 161; else bmr += 5;
  const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, extreme: 1.9 };
  return Math.round(bmr * (multipliers[activityLevel] || 1.375));
};

export const calculateTargetCalories = (tdee, goal) => {
  let target = tdee;
  if (goal === 'cut') { target = tdee * 0.80; if (target < 1200) target = 1200; }
  else if (goal === 'bulk') { target = tdee * 1.10; }
  return Math.round(target);
};

// Single source of truth for macro goals. Protein/fat scale with bodyweight;
// carbs fill the remaining calories; fiber ~14g per 1000 kcal.
export const computeMacroTargets = (caloriesTarget, goal = 'maintenance', weightLbs = 180) => {
  const cals = parseFloat(caloriesTarget) || 2000;
  const w = parseFloat(weightLbs) || 180;
  const protein = Math.round(w * (goal === 'cut' ? 1.0 : 0.8)); // g/lb
  const fats = Math.round(w * 0.35);                            // g/lb
  const carbs = Math.max(0, Math.round((cals - (protein * 4) - (fats * 9)) / 4));
  const fiber = Math.round((cals / 1000) * 14);
  return { protein, carbs, fats, fiber };
};
