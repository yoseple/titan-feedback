import React from 'react';
import { Beef, Wheat, Droplets } from 'lucide-react';

const MacroBar = ({ label, current, goal, colorClass, icon: Icon }) => {
  const progress = Math.min(100, (current / goal) * 100);
  return (
    <div className="flex-1 bg-gray-900/50 rounded-lg p-2 border border-gray-700/50">
      <div className="flex items-center gap-1.5 mb-1.5"><Icon className={`w-3 h-3 ${colorClass}`} /><span className="text-[10px] font-bold text-gray-400 uppercase">{label}</span></div>
      <div className="flex items-end justify-between mb-1"><span className="text-sm font-bold text-white leading-none">{current}g</span><span className="text-[9px] text-gray-600">/ {goal}g</span></div>
      <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden"><div className={`h-full ${colorClass.replace('text-', 'bg-')}`} style={{ width: `${progress}%` }}></div></div>
    </div>
  );
};

const CalorieDashboard = ({ consumed, goal, protein, proteinGoal, carbs, carbsGoal, fats, fatsGoal }) => {
  const safeGoal = goal > 0 ? goal : 2000; const remaining = safeGoal - consumed; const progress = Math.min(100, (consumed / safeGoal) * 100);
  return (
    <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 mb-6 shadow-lg relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
      <div className="flex justify-between items-end mb-4 relative z-10"><div><h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Daily Fuel</h4><div className={`text-3xl font-black ${remaining < 0 ? 'text-red-500' : 'text-white'}`}>{remaining}</div><div className="text-[10px] text-gray-500 font-mono">CALORIES REMAINING</div></div><div className="text-right"><div className="text-xs text-gray-400 font-bold">{consumed} / {safeGoal}</div></div></div>
      <div className="h-3 w-full bg-gray-900 rounded-full overflow-hidden mb-5 relative z-10"><div className={`h-full transition-all duration-1000 ${remaining < 0 ? 'bg-red-500' : 'bg-gradient-to-r from-green-500 to-emerald-400'}`} style={{width: `${progress}%`}}></div></div>
      <div className="grid grid-cols-3 gap-3 relative z-10">
        <MacroBar label="Protein" current={protein} goal={proteinGoal||150} colorClass="text-blue-500" icon={Beef} />
        <MacroBar label="Carbs" current={carbs} goal={carbsGoal||200} colorClass="text-orange-500" icon={Wheat} />
        <MacroBar label="Fats" current={fats} goal={fatsGoal||60} colorClass="text-yellow-500" icon={Droplets} />
      </div>
    </div>
  );
};
export default CalorieDashboard;