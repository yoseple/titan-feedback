import React, { useState, useMemo } from 'react';
import { Settings, X, Flame } from 'lucide-react';
import WeightChart from '../charts/WeightChart';

// Helper for local date
const getLocalDate = (date) => {
  const d = new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return (new Date(d - offset)).toISOString().slice(0, 10);
};

const ProfileModal = ({ onClose, userProfile, setUserProfile, saveProfile, weightLog, foodLog, workoutLogs }) => {
  const [activeSubTab, setActiveSubTab] = useState('progress');

  const dailyNutrition = useMemo(() => {
    const grouped = {};
    foodLog.forEach(log => {
      if (!grouped[log.date]) grouped[log.date] = { calories: 0, protein: 0 };
      grouped[log.date].calories += (log.calories || 0);
      grouped[log.date].protein += (log.protein || 0);
    });
    return Object.entries(grouped).sort((a,b) => new Date(b[0]) - new Date(a[0]));
  }, [foodLog]);

  const streak = useMemo(() => {
    const dates = [...new Set(workoutLogs.map(l => l.date))].sort((a,b) => new Date(b) - new Date(a));
    if (dates.length === 0) return 0;
    const today = getLocalDate(new Date());
    const yesterday = getLocalDate(new Date(Date.now() - 86400000));
    if (dates[0] !== today && dates[0] !== yesterday) return 0;
    let count = 1;
    for (let i = 0; i < dates.length - 1; i++) {
       const curr = new Date(dates[i]); const prev = new Date(dates[i+1]);
       const diff = (curr - prev) / (1000 * 60 * 60 * 24);
       if (diff === 1) count++; else break;
    }
    return count;
  }, [workoutLogs]);

  return (
    <div className="fixed inset-0 z-[150] bg-black/95 flex flex-col animate-in slide-in-from-right duration-300">
       <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Settings className="w-5 h-5"/> Profile & Progress</h2>
          <button onClick={onClose} className="p-2 bg-gray-800 rounded-full text-white hover:bg-gray-700"><X className="w-6 h-6"/></button>
       </div>
       <div className="flex border-b border-gray-800 p-2 gap-2 bg-gray-900">
          <button onClick={() => setActiveSubTab('progress')} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg ${activeSubTab==='progress' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>Progress</button>
          <button onClick={() => setActiveSubTab('settings')} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg ${activeSubTab==='settings' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>Settings</button>
       </div>
       <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {activeSubTab === 'settings' ? (
             <div className="space-y-4">
               <div><label className="text-xs text-gray-400 uppercase">Height (cm)</label><input type="number" value={userProfile.height} onChange={e=>setUserProfile({...userProfile, height: e.target.value})} className="w-full bg-slate-800 text-white p-4 rounded-xl border border-gray-700"/></div>
               <div><label className="text-xs text-gray-400 uppercase">Age</label><input type="number" value={userProfile.age} onChange={e=>setUserProfile({...userProfile, age: e.target.value})} className="w-full bg-slate-800 text-white p-4 rounded-xl border border-gray-700"/></div>
               <div><label className="text-xs text-gray-400 uppercase">Gender</label><select value={userProfile.gender} onChange={e=>setUserProfile({...userProfile, gender: e.target.value})} className="w-full bg-slate-800 text-white p-4 rounded-xl border border-gray-700"><option value="male">Male</option><option value="female">Female</option></select></div>
               <div className="flex items-center gap-2 mt-4 p-4 bg-gray-800 rounded-xl border border-gray-700"><input type="checkbox" checked={userProfile.simpleMode || false} onChange={e=>setUserProfile({...userProfile, simpleMode: e.target.checked})} className="w-5 h-5 rounded border-gray-600"/><div className="flex-1"><div className="font-bold text-white text-sm">Simple Workout Mode</div><div className="text-xs text-gray-400">Hide Lbs/Reps inputs, just checkboxes.</div></div></div>
               <button onClick={saveProfile} className="w-full bg-red-600 text-white py-4 rounded-xl font-bold mt-4">Save Changes</button>
             </div>
          ) : (
             <div className="space-y-6">
                <div className="bg-gradient-to-r from-orange-600/20 to-red-600/20 p-6 rounded-2xl border border-orange-500/30 flex items-center justify-between">
                   <div><div className="text-xs text-orange-400 font-bold uppercase tracking-widest">Current Streak</div><div className="text-4xl font-black text-white">{streak} <span className="text-sm font-normal text-gray-400">days</span></div></div>
                   <Flame className="w-12 h-12 text-orange-500 animate-pulse"/>
                </div>
                <div><h3 className="text-sm font-bold text-gray-300 mb-3 uppercase tracking-wide">Weight History</h3><WeightChart data={weightLog} showDates={true} /></div>
                <div><h3 className="text-sm font-bold text-gray-300 mb-3 uppercase tracking-wide">Calorie Log</h3><div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"><div className="flex bg-gray-900 p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider"><div className="flex-1">Date</div><div className="w-20 text-right">Cals</div><div className="w-20 text-right">Protein</div></div><div className="max-h-60 overflow-y-auto">{dailyNutrition.map(([date, data], i) => (<div key={i} className="flex p-3 border-b border-gray-700/50 text-sm text-gray-300"><div className="flex-1 font-mono text-xs">{date}</div><div className="w-20 text-right font-bold">{data.calories}</div><div className="w-20 text-right text-blue-400">{data.protein}g</div></div>))}{dailyNutrition.length === 0 && <div className="p-4 text-center text-xs text-gray-500">No logs yet.</div>}</div></div></div>
             </div>
          )}
       </div>
    </div>
  );
};
export default ProfileModal;