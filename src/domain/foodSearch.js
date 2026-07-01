// src/domain/foodSearch.js
// Pure ranking + de-duplication for food search results, so the best match sorts
// first and duplicate / 0-kcal junk rows don't clutter the list.

const sourceRank = (r) => {
  const s = (r.source || '').toUpperCase();
  if (s.includes('USDA')) return 3;
  if (s.includes('OFF')) return 2;
  if (s.includes('AI')) return 1;
  return 0;
};

const nameScore = (name, q) => {
  const n = (name || '').toLowerCase();
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 60;
  if (n.includes(q)) return 30;
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.filter((t) => n.includes(t)).length * 10;
};

export const scoreResult = (r, q) => {
  // 0-kcal / missing-energy rows are almost always junk — force them below every real
  // result regardless of name match, so an exact-name-but-empty row can't rank near the top.
  if (!(Number(r.calories) > 0)) return -1000 + nameScore(r.name, q);
  return nameScore(r.name, q) + sourceRank(r) * 5;
};

export const dedupeResults = (results) => {
  const seen = new Set();
  const out = [];
  for (const r of results || []) {
    const key = `${(r.name || '').toLowerCase().trim()}|${r.calories || 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
};

export const rankFoodResults = (results, query) => {
  const q = (query || '').toLowerCase().trim();
  return dedupeResults(results)
    .map((r, i) => ({ r, i, score: scoreResult(r, q) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.r);
};
