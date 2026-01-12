import React from 'react';
import { CalendarDays } from 'lucide-react';

const ConsistencyHeatmap = ({ workoutLogs, foodLogs }) => {
  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (27 - i)); return d.toISOString().split('T')[0];
  });
  return (
    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 mb-6">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Consistency</h4>
      <div className="flex justify-between gap-1">
        {days.map(date => {
          const hasWorkout = workoutLogs.some(l => l.date === date); const hasFood = foodLogs.some(l => l.date === date);
          let color = 'bg-gray-700'; if (hasWorkout && hasFood) color = 'bg-gradient-to-t from-blue-500 to-red-500'; else if (hasWorkout) color = 'bg-red-600'; else if (hasFood) color = 'bg-blue-600';
          return <div key={date} className={`w-2 h-8 rounded-sm ${color} transition-all`}></div>
        })}
      </div>
    </div>
  );
};
export default ConsistencyHeatmap;