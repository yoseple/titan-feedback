import React, { useMemo } from 'react';
import { TrendingUp, X, Calendar } from 'lucide-react';

const LiftHistoryModal = ({ exerciseName, history, onClose }) => {
  const exerciseHistory = useMemo(() => {
    if (!history) return [];
    return history
      .filter(h => h.exercise === exerciseName)
      // Sort by Timestamp (createdAt) if available to preserve order of multiple sets in one day
      .sort((a, b) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.date).getTime();
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.date).getTime();
          return tA - tB;
      });
  }, [history, exerciseName]);

  const points = useMemo(() => {
    if (exerciseHistory.length < 2) return "";
    
    // Plot 'Weight' specifically (or duration for cardio)
    const getValue = (h) => h.duration ? parseFloat(h.duration) : parseFloat(h.weight || 0);
    
    const values = exerciseHistory.map(getValue);
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    
    // Add buffer so lines don't touch edges
    const range = (maxVal - minVal) || 1; 
    
    return exerciseHistory.map((h, i) => {
      const val = getValue(h);
      // X-Axis: Spread evenly
      const x = (i / (exerciseHistory.length - 1)) * 280 + 10; 
      // Y-Axis: Invert so higher value is higher up. Use 60% height to keep centered.
      const y = 90 - (((val - minVal) / range) * 60); 
      return `${x},${y}`;
    }).join(' ');
  }, [exerciseHistory]);

  // FIX: Force time to Noon to avoid Timezone Day Shift (e.g. UTC midnight -> EST prev day)
  const getWeekday = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(`${dateStr}T12:00:00`); 
      return d.toLocaleDateString('en-US', {weekday:'short'});
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 rounded-3xl border border-gray-800 w-full max-w-lg p-6 relative shadow-2xl">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
              <h3 className="text-2xl font-black text-white flex items-center gap-2 italic tracking-tight">
                  <TrendingUp className="w-6 h-6 text-emerald-500"/> {exerciseName}
              </h3>
              <p className="text-gray-500 text-xs mt-1 font-mono uppercase">History & Progression</p>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition"><X className="w-6 h-6"/></button>
        </div>

        {exerciseHistory.length === 0 ? (
            <div className="text-center text-gray-500 py-16 border-2 border-dashed border-gray-800 rounded-2xl">
                No logs found for this exercise.
            </div>
        ) : (
          <>
             {/* GRAPH */}
             <div className="w-full h-48 bg-gradient-to-b from-emerald-900/10 to-transparent rounded-2xl border border-emerald-500/20 p-4 mb-6 relative overflow-hidden">
                {exerciseHistory.length > 1 ? (
                  <svg viewBox="0 0 300 100" className="w-full h-full overflow-visible">
                    {/* Grid Lines */}
                    <line x1="0" y1="50" x2="300" y2="50" stroke="#374151" strokeWidth="0.5" strokeDasharray="4"/>

                    {/* The Line */}
                    <polyline 
                        fill="none" 
                        stroke="#10b981" 
                        strokeWidth="3" 
                        points={points} 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        filter="drop-shadow(0px 4px 4px rgba(0,0,0,0.5))"
                    />
                    
                    {/* The Dots & Labels */}
                    {points.split(' ').map((p, i) => { 
                        const [cx, cy] = p.split(','); 
                        const log = exerciseHistory[i];
                        const val = log.duration ? `${log.duration}m` : log.weight;

                        return (
                            <g key={i} className="group">
                                <circle cx={cx} cy={cy} r="4" fill="#064e3b" stroke="#10b981" strokeWidth="2" className="transition-all duration-300 group-hover:r-6"/>
                                {/* Value Label */}
                                <text x={cx} y={parseFloat(cy) - 10} fontSize="10" fill="#a7f3d0" fontWeight="bold" textAnchor="middle" style={{textShadow: '0px 2px 4px black'}}>
                                    {val}
                                </text>
                            </g>
                        );
                    })}
                  </svg>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500">
                        <TrendingUp className="w-8 h-8 mb-2 opacity-20"/>
                        Need at least 2 logs to show a trend.
                    </div>
                )}
             </div>

             {/* LOG LIST */}
             <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
               <div className="flex justify-between text-[10px] text-gray-500 uppercase font-bold px-3 pb-1 tracking-wider">
                   <span>Date</span>
                   <span>Set Details</span>
               </div>
               
               {[...exerciseHistory].reverse().map((log, i) => (
                 <div key={i} className="flex justify-between items-center p-3 bg-gray-800/50 hover:bg-gray-800 rounded-xl border border-gray-700 transition">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-900 rounded-lg text-gray-500">
                            <Calendar size={14}/>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-300 font-bold">{log.date}</span>
                            <span className="text-[10px] text-gray-500">
                                {getWeekday(log.date)} {/* <--- USES THE FIX */}
                            </span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm font-black text-white">
                            {log.duration ? `${log.duration} min` : `${log.weight} lbs`}
                        </div>
                        {!log.duration && (
                            <div className="text-xs text-emerald-500 font-mono">
                                x {log.reps} reps
                            </div>
                        )}
                    </div>
                 </div>
               ))}
             </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LiftHistoryModal;