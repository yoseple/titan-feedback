import React, { useMemo } from 'react';
import { TrendingUp, X } from 'lucide-react';

const LiftHistoryModal = ({ exerciseName, history, onClose }) => {
  const exerciseHistory = useMemo(() => {
    if (!history) return [];
    return history
      .filter(h => h.exercise === exerciseName)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [history, exerciseName]);

  const points = useMemo(() => {
    if (exerciseHistory.length < 2) return "";
    const getValue = (h) => h.duration ? h.duration : ((h.weight || 0) * (h.reps || 0));
    const maxVal = Math.max(...exerciseHistory.map(getValue));
    const minVal = Math.min(...exerciseHistory.map(getValue));
    const range = maxVal - minVal || 1;
    return exerciseHistory.map((h, i) => {
      const val = getValue(h);
      const x = (i / (exerciseHistory.length - 1)) * 280 + 10;
      const y = 90 - (((val - minVal) / range) * 80);
      return `${x},${y}`;
    }).join(' ');
  }, [exerciseHistory]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-md p-6 relative">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-500"/> {exerciseName}</h3>
          <button onClick={onClose} className="p-2 bg-gray-700 rounded-full hover:bg-gray-600"><X className="w-5 h-5 text-white"/></button>
        </div>
        {exerciseHistory.length === 0 ? <div className="text-center text-gray-500 py-10">No logs found.</div> : (
          <>
             <div className="w-full h-40 bg-gray-900/50 rounded-xl border border-gray-700 p-2 mb-4 relative">
                {exerciseHistory.length > 1 ? (
                  <svg viewBox="0 0 300 100" className="w-full h-full overflow-visible">
                    <polyline fill="none" stroke="#22c55e" strokeWidth="3" points={points} strokeLinecap="round" strokeLinejoin="round"/>
                    {points.split(' ').map((p, i) => { const [cx, cy] = p.split(','); return <circle key={i} cx={cx} cy={cy} r="3" fill="#1f2937" stroke="#22c55e" strokeWidth="2"/> })}
                  </svg>
                ) : <div className="flex items-center justify-center h-full text-xs text-gray-500">Need 2+ logs for graph</div>}
             </div>
             <div className="max-h-60 overflow-y-auto space-y-2">
               <div className="flex justify-between text-xs text-gray-500 uppercase font-bold px-2"><span>Date</span><span>Result</span></div>
               {[...exerciseHistory].reverse().map((log, i) => (
                 <div key={i} className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg border border-gray-700/50">
                    <span className="text-sm text-gray-300 font-mono">{log.date}</span>
                    <span className="text-sm font-bold text-white">
                      {log.duration ? `${log.duration} min` : `${log.weight}lbs x ${log.reps}`}
                    </span>
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