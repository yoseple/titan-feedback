import React, { useState, useEffect, useMemo } from 'react';
import { Check, ChevronUp, ChevronDown, BarChart2 } from 'lucide-react';

const ExerciseCard = ({ ex, onLog, onDeleteLog, history, date, isComplete, simpleMode, onViewHistory }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [warnIdx, setWarnIdx] = useState(null); // set row flagged for missing weight/reps
  const numSets = parseInt(ex.sets) || 1;
  const type = ex.type || (["Cardio", "Run", "Walk", "Treadmill"].some(k => ex.name.includes(k)) ? 'cardio' : ["Pushups", "Plank", "Burpees"].some(k => ex.name.includes(k)) ? 'bodyweight' : 'weighted');
  const [setsData, setSetsData] = useState(() => Array.from({ length: numSets }, () => ({ weight: '', reps: '', duration: '', distance: '', completed: false, logId: null })));

  // The most recent PRIOR session for this exercise (its sets, oldest-first) — used to
  // prefill today's un-logged sets so an unchanged set is a single confirm tap.
  const lastSession = useMemo(() => {
    if (!history) return [];
    const prior = history.filter(h => h.exercise === ex.name && h.date < date);
    if (!prior.length) return [];
    const lastDate = prior.reduce((m, h) => (h.date > m ? h.date : m), prior[0].date);
    return prior.filter(h => h.date === lastDate).sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
  }, [history, ex.name, date]);

  useEffect(() => {
    if (!history) return;
    const todaysLogs = history.filter(h => h.exercise === ex.name && h.date === date).sort((a,b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
    setSetsData(prev => {
       const next = Array.from({ length: numSets }, () => ({ weight: '', reps: '', duration: '', distance: '', completed: false, logId: null }));
       for(let i=0; i<numSets; i++) {
          if(todaysLogs[i]) {
             next[i] = { 
                weight: todaysLogs[i].weight || '', 
                reps: todaysLogs[i].reps || '', 
                duration: todaysLogs[i].duration || '',
                distance: todaysLogs[i].distance || '',
                completed: true, 
                logId: todaysLogs[i].id 
             };
          } else {
             const existing = prev[i];
             if(existing && !existing.completed && (existing.weight || existing.reps || existing.duration || existing.distance)) {
                next[i] = existing; // keep the user's in-progress typing
             } else if (lastSession[i]) {
                // Prefill from last session (editable, not marked completed).
                next[i] = {
                   weight: lastSession[i].weight ? String(lastSession[i].weight) : '',
                   reps: lastSession[i].reps ? String(lastSession[i].reps) : '',
                   duration: lastSession[i].duration ? String(lastSession[i].duration) : '',
                   distance: lastSession[i].distance ? String(lastSession[i].distance) : '',
                   completed: false, logId: null,
                };
             }
          }
       }
       return next;
    });
  }, [history, date, ex.name, numSets, lastSession]);

  const toggleSet = (idx) => {
     const set = setsData[idx];
     if (set.completed) { if (set.logId) onDeleteLog(set.logId); }
     else {
        // Don't silently no-op: flag the row so the empty field(s) flash red instead of the
        // check button appearing broken (a new user's likely first interaction).
        if (type === 'weighted' && (!set.weight || !set.reps) && !simpleMode) {
           setWarnIdx(idx);
           setTimeout(() => setWarnIdx((c) => (c === idx ? null : c)), 1600);
           return;
        }
        onLog(ex.name, set.weight||0, set.reps||0, set.distance||0, set.duration||0);
     }
  };
  
  const updateSet = (idx, f, v) => { const ns = [...setsData]; ns[idx] = { ...ns[idx], [f]: v }; setSetsData(ns); };

  return (
    <div className={`rounded-xl border overflow-hidden mb-3 ${isComplete ? 'bg-green-900/20 border-green-600/50' : 'bg-gray-800 border-gray-700'}`}>
       <div onClick={() => setIsExpanded(!isExpanded)} role="button" tabIndex={0} aria-expanded={isExpanded} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded(v => !v); } }} className="p-4 flex justify-between items-center cursor-pointer">
          <div className="flex-1"><h4 className={`font-bold text-sm ${isComplete ? 'text-green-400' : 'text-white'}`}>{ex.name}</h4><div className="text-xs text-gray-500">{ex.sets} Sets • {ex.reps} {type === 'cardio' ? 'Mins' : 'Reps'}</div></div>
          <div className="flex gap-2">
            <button onClick={(e) => {e.stopPropagation(); onViewHistory(ex.name);}} className="p-2 text-gray-500 hover:text-white"><BarChart2 className="w-4 h-4"/></button>
            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400"/> : <ChevronDown className="w-5 h-5 text-gray-400"/>}
          </div>
       </div>
       {isExpanded && (
          <div className="p-3 border-t border-gray-700/50 space-y-2">
             {lastSession.length > 0 && !setsData.some(s => s.completed) && (
                <div className="text-[10px] text-gray-500 text-center pb-1">↺ Last time: {type === 'cardio' ? `${lastSession[0].duration || 0} min` : `${lastSession[0].weight || 0} lb × ${lastSession[0].reps || 0}`}</div>
             )}
             <div className="flex text-[9px] text-gray-500 uppercase font-bold justify-center gap-2"><div className="w-6 text-center">#</div>{type === 'weighted' && <div className="w-20 text-center">Lbs</div>}<div className="w-20 text-center">{type === 'cardio' ? 'Mins' : 'Reps'}</div><div className="w-10"></div></div>
             {setsData.map((s, i) => (
                <div key={i} className="flex gap-2 items-center justify-center">
                   <div className="w-6 text-gray-500 text-xs font-mono text-center">{i+1}</div>
                   {type === 'cardio' ? (
                      <>
                         <input type="number" placeholder="Mins" className="w-20 bg-gray-900 text-white text-center p-2 rounded border border-gray-600" value={s.duration} onChange={e=>updateSet(i,'duration',e.target.value)} disabled={s.completed} />
                         <input type="number" placeholder="Dist" className="w-20 bg-gray-900 text-white text-center p-2 rounded border border-gray-600" value={s.distance} onChange={e=>updateSet(i,'distance',e.target.value)} disabled={s.completed} />
                      </>
                   ) : (
                      <>
                         {type === 'weighted' && <input type="number" inputMode="decimal" placeholder="Lbs" className={`w-20 bg-gray-900 text-white text-center p-2 rounded border ${warnIdx===i && !s.weight ? 'border-red-500' : 'border-gray-600'}`} value={s.weight} onChange={e=>updateSet(i,'weight',e.target.value)} disabled={s.completed} />}
                         <input type="number" inputMode="numeric" placeholder="Reps" className={`w-20 bg-gray-900 text-white text-center p-2 rounded border ${warnIdx===i && !s.reps ? 'border-red-500' : 'border-gray-600'}`} value={s.reps} onChange={e=>updateSet(i,'reps',e.target.value)} disabled={s.completed} />
                      </>
                   )}
                   <button onClick={() => toggleSet(i)} className={`ml-auto w-10 h-10 flex items-center justify-center rounded ${s.completed ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}><Check className="w-5 h-5"/></button>
                </div>
             ))}
          </div>
       )}
    </div>
  )
}
export default ExerciseCard;