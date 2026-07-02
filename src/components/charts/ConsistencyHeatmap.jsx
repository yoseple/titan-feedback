import React from 'react';
import { CalendarDays } from 'lucide-react';
import { getLocalDate } from '../../utils/date';

const ConsistencyHeatmap = ({ workoutLogs, foodLogs }) => {
  const today = getLocalDate(new Date());
  const days = Array.from({ length: 28 }, (_, i) => {
    // Use the same local-date basis the logs are stored with, or the grid shifts a
    // day for users west/east of UTC and "today" never lights up (B11/B18).
    const d = new Date(); d.setDate(d.getDate() - (27 - i)); return getLocalDate(d);
  });
  const activeCount = days.filter(
    (date) => workoutLogs.some((l) => l.date === date) || foodLogs.some((l) => l.date === date)
  ).length;

  return (
    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 mb-6">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Consistency</h4>
        <span className="text-[10px] text-gray-500 font-bold">{activeCount} of 28 days</span>
      </div>
      <div className="flex justify-between gap-1" role="img" aria-label={`${activeCount} of the last 28 days had a logged workout or meal`}>
        {days.map((date) => {
          const hasWorkout = workoutLogs.some((l) => l.date === date);
          const hasFood = foodLogs.some((l) => l.date === date);
          // Workout uses emerald (a positive signal), not red — red is reserved for
          // over-target / destructive elsewhere.
          let color = 'bg-gray-700';
          if (hasWorkout && hasFood) color = 'bg-gradient-to-t from-blue-500 to-emerald-500';
          else if (hasWorkout) color = 'bg-emerald-500';
          else if (hasFood) color = 'bg-blue-500';
          return (
            <div
              key={date}
              title={date}
              className={`flex-1 h-8 rounded-sm ${color} ${date === today ? 'ring-2 ring-white/60' : ''} transition-all`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-3 text-[9px] text-gray-500 font-bold uppercase tracking-wide">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Food</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Workout</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-t from-blue-500 to-emerald-500" /> Both</span>
      </div>
    </div>
  );
};
export default ConsistencyHeatmap;
