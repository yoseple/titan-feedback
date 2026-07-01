// Local calendar date as "YYYY-MM-DD" (NOT UTC).
// Writers (food/workout/weight logs) and readers (tracker, heatmap, streaks) must
// all use this so day buckets line up. toISOString() alone buckets by UTC and
// shifts the day for users at negative/positive offsets (the heatmap off-by-one).
export const getLocalDate = (date = new Date()) => {
  const d = new Date(date);
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d - offsetMs).toISOString().slice(0, 10);
};
