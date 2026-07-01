import { getLocalDate } from '../utils/date';

// Calories consumed per day for the last 7 days (oldest -> newest), computed from
// the food log. Pure + local-date based so it lines up with how logs are stored.
export const weeklyCalories = (foodLogs = [], today = getLocalDate()) => {
  const [y, m, d] = String(today).split('-').map(Number);
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(y, (m || 1) - 1, (d || 1) - i); // local-date arithmetic
    const date = getLocalDate(dt);
    const calories = (foodLogs || [])
      .filter((f) => f && f.date === date)
      .reduce((s, f) => s + (f.calories || 0), 0);
    out.push({ date, calories, label: 'SMTWTFS'[dt.getDay()] });
  }
  return out;
};
