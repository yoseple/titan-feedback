import React, { useState } from 'react';
import { Save, X, Trash2, Plus, GripVertical, AlertCircle } from 'lucide-react';

const WorkoutDayEditor = ({ dayData, onSave, onCancel }) => {
  const [editedDay, setEditedDay] = useState(JSON.parse(JSON.stringify(dayData)));
  const [error, setError] = useState('');

  // Exercises are identified by NAME everywhere (React key, the workout_logs `exercise`
  // field, completion counting), so blank or duplicate names collide — one card vanishes
  // and sets/completion bleed onto the wrong exercise. Enforce non-blank + unique on save.
  const handleSave = () => {
    const names = editedDay.exercises.map((e) => (e.name || '').trim().toLowerCase());
    if (names.some((n) => !n)) { setError('Every exercise needs a name.'); return; }
    if (names.some((n, i) => names.indexOf(n) !== i)) { setError('Each exercise needs a unique name.'); return; }
    setError('');
    onSave(editedDay);
  };

  const updateExercise = (idx, field, val) => { 
    const newEx = [...editedDay.exercises]; 
    newEx[idx] = { ...newEx[idx], [field]: val }; 
    setEditedDay({ ...editedDay, exercises: newEx }); 
  };

  const removeExercise = (idx) => { 
    const newEx = [...editedDay.exercises]; 
    newEx.splice(idx, 1); 
    setEditedDay({ ...editedDay, exercises: newEx }); 
  };

  const addExercise = () => { 
    setEditedDay({ ...editedDay, exercises: [...editedDay.exercises, { name: "", sets: "3", reps: "10", tips: "", type: "weighted" }] }); 
  };

  return (
    <div className="bg-amber-900/10 rounded-2xl border-2 border-amber-500/50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 mb-6 shadow-2xl relative">
      
      {/* --- EDITOR HEADER --- */}
      <div className="p-4 bg-amber-500/10 border-b border-amber-500/30 flex justify-between items-center">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 rounded-lg text-black animate-pulse">
                <AlertCircle className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-black text-amber-500 uppercase tracking-widest text-sm">Editor Mode</h3>
                <div className="text-white font-bold text-lg leading-none">{dayData.day} Plan</div>
            </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-bold text-xs uppercase tracking-wider transition">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-900/20 transition active:scale-95"><Save className="w-4 h-4"/> Save Changes</button>
        </div>
      </div>

      {error && <div className="px-4 py-2 bg-red-900/30 text-red-300 text-xs font-bold border-b border-red-800">{error}</div>}

      {/* --- EXERCISE LIST --- */}
      <div className="p-4 space-y-3">
        {editedDay.exercises.map((ex, i) => (
          <div key={i} className="bg-gray-900 p-4 rounded-xl border border-gray-700 shadow-sm relative group transition hover:border-gray-500">
            {/* Index & Type Selector Row */}
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                    <GripVertical className="text-gray-600 w-4 h-4" />
                    <span className="text-xs font-mono text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">#{i + 1}</span>
                    <select 
                        className="bg-transparent text-xs font-bold text-blue-400 outline-none uppercase tracking-wider cursor-pointer hover:text-blue-300"
                        value={ex.type || 'weighted'} 
                        onChange={e => updateExercise(i, 'type', e.target.value)}
                    >
                        <option value="weighted">Weighted</option>
                        <option value="bodyweight">Bodyweight</option>
                        <option value="cardio">Cardio</option>
                    </select>
                </div>
                <button onClick={() => removeExercise(i)} className="text-gray-600 hover:text-red-500 transition"><Trash2 className="w-4 h-4"/></button>
            </div>

            {/* Inputs Grid */}
            <div className="space-y-3">
                {/* Name Input */}
                <div>
                    <input 
                        className="w-full bg-gray-800 text-white font-bold text-lg p-3 rounded-lg border border-gray-700 focus:border-amber-500 outline-none placeholder-gray-600 transition" 
                        value={ex.name} 
                        onChange={e => updateExercise(i, 'name', e.target.value)} 
                        placeholder="Exercise Name (e.g. Bench Press)" 
                    />
                </div>

                {/* Details Row */}
                <div className="flex gap-3">
                    {ex.type === 'cardio' ? (
                       <>
                          <div className="flex-1">
                              <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Duration/Dist</label>
                              <input className="w-full bg-gray-800 text-white text-sm p-2 rounded-lg border border-gray-700 focus:border-amber-500 outline-none" value={ex.reps} onChange={e => updateExercise(i, 'reps', e.target.value)} placeholder="e.g. 30 mins"/>
                          </div>
                          <div className="flex-[2]">
                              <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Intensity / Notes</label>
                              <input className="w-full bg-gray-800 text-white text-sm p-2 rounded-lg border border-gray-700 focus:border-amber-500 outline-none" value={ex.tips} onChange={e => updateExercise(i, 'tips', e.target.value)} placeholder="e.g. Zone 2 Heart Rate"/>
                          </div>
                       </>
                    ) : (
                       <>
                          <div className="w-20">
                              <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Sets</label>
                              <input className="w-full bg-gray-800 text-white text-center font-mono text-sm p-2 rounded-lg border border-gray-700 focus:border-amber-500 outline-none" value={ex.sets} onChange={e => updateExercise(i, 'sets', e.target.value)} placeholder="3"/>
                          </div>
                          <div className="w-24">
                              <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Reps</label>
                              <input className="w-full bg-gray-800 text-white text-center font-mono text-sm p-2 rounded-lg border border-gray-700 focus:border-amber-500 outline-none" value={ex.reps} onChange={e => updateExercise(i, 'reps', e.target.value)} placeholder="8-12"/>
                          </div>
                          <div className="flex-1">
                              <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Tips / Cue</label>
                              <input className="w-full bg-gray-800 text-white text-sm p-2 rounded-lg border border-gray-700 focus:border-amber-500 outline-none" value={ex.tips} onChange={e => updateExercise(i, 'tips', e.target.value)} placeholder="e.g. Slow negative"/>
                          </div>
                       </>
                    )}
                </div>
            </div>
          </div>
        ))}

        <button onClick={addExercise} className="w-full py-4 border-2 border-dashed border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-800 rounded-xl font-bold flex items-center justify-center gap-2 transition group">
            <div className="p-1 bg-gray-700 rounded-full group-hover:bg-gray-600"><Plus className="w-4 h-4"/></div> Add New Exercise
        </button>
      </div>
    </div>
  );
};

export default WorkoutDayEditor;