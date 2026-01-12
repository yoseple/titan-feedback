import React, { useState } from 'react';
import { Save, X, Trash2, Plus } from 'lucide-react';

const WorkoutDayEditor = ({ dayData, onSave, onCancel }) => {
  const [editedDay, setEditedDay] = useState(JSON.parse(JSON.stringify(dayData)));
  const updateExercise = (idx, field, val) => { const newEx = [...editedDay.exercises]; newEx[idx] = { ...newEx[idx], [field]: val }; setEditedDay({ ...editedDay, exercises: newEx }); };
  const removeExercise = (idx) => { const newEx = [...editedDay.exercises]; newEx.splice(idx, 1); setEditedDay({ ...editedDay, exercises: newEx }); };
  const addExercise = () => { setEditedDay({ ...editedDay, exercises: [...editedDay.exercises, { name: "", sets: "3", reps: "10", tips: "", type: "weighted" }] }); };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden animate-in fade-in duration-200 mb-4">
      <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
        <h3 className="font-bold text-white">Editing {dayData.day}</h3>
        <div className="flex gap-2">
          <button onClick={() => onSave(editedDay)} className="p-2 bg-green-600 rounded text-white"><Save className="w-4 h-4"/></button>
          <button onClick={onCancel} className="p-2 bg-gray-700 rounded text-gray-300"><X className="w-4 h-4"/></button>
        </div>
      </div>
      <div className="p-2 space-y-2">
        {editedDay.exercises.map((ex, i) => (
          <div key={i} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50 flex flex-col gap-2">
            <div className="flex gap-2">
               <input className="flex-1 bg-gray-800 text-white text-sm p-2 rounded border border-gray-600 focus:border-red-500 outline-none" value={ex.name} onChange={e => updateExercise(i, 'name', e.target.value)} placeholder="Exercise Name" />
               <select className="bg-gray-800 text-white text-xs p-2 rounded border border-gray-600" value={ex.type || 'weighted'} onChange={e => updateExercise(i, 'type', e.target.value)}>
                  <option value="weighted">Weights (Lbs/Reps)</option>
                  <option value="bodyweight">Bodyweight (Reps)</option>
                  <option value="cardio">Cardio (Mins/Dist)</option>
               </select>
               <button onClick={() => removeExercise(i)} className="p-2 text-red-400 bg-gray-800 rounded border border-gray-600"><Trash2 className="w-4 h-4"/></button>
            </div>
            {ex.type === 'cardio' ? (
               <div className="grid grid-cols-2 gap-2">
                  <input className="bg-gray-800 text-white text-xs p-2 rounded border border-gray-600" value={ex.reps} onChange={e => updateExercise(i, 'reps', e.target.value)} placeholder="Duration (mins)"/>
                  <input className="bg-gray-800 text-white text-xs p-2 rounded border border-gray-600" value={ex.tips} onChange={e => updateExercise(i, 'tips', e.target.value)} placeholder="Tip / Intensity"/>
               </div>
            ) : (
               <div className="grid grid-cols-3 gap-2">
                  <input className="bg-gray-800 text-white text-xs p-2 rounded border border-gray-600" value={ex.sets} onChange={e => updateExercise(i, 'sets', e.target.value)} placeholder="Sets"/>
                  <input className="bg-gray-800 text-white text-xs p-2 rounded border border-gray-600" value={ex.reps} onChange={e => updateExercise(i, 'reps', e.target.value)} placeholder="Reps"/>
                  <input className="bg-gray-800 text-white text-xs p-2 rounded border border-gray-600" value={ex.tips} onChange={e => updateExercise(i, 'tips', e.target.value)} placeholder="Tip"/>
               </div>
            )}
          </div>
        ))}
        <button onClick={addExercise} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2"><Plus className="w-4 h-4"/> Add Exercise</button>
      </div>
    </div>
  );
};
export default WorkoutDayEditor;