import React, { useState } from 'react';
import { ChefHat, Minimize2, Check } from 'lucide-react';

const ChefMode = ({ meal, onClose }) => {
  const [checkedSteps, setCheckedSteps] = useState({});

  // Safety check if meal is missing data
  if (!meal) return null;

  const ingredients = meal.ingredients || [];
  // Split instructions by new line, remove empty strings. Fallback to empty array if no instructions.
  const instructions = meal.instructions 
    ? meal.instructions.split('\n').filter(s => s.trim()) 
    : [];

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col animate-in zoom-in duration-200">
      {/* Header */}
      <div className="p-6 bg-gray-900 border-b border-gray-800 flex justify-between items-center shrink-0">
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          <ChefHat className="w-8 h-8 text-orange-500"/> Chef Mode
        </h2>
        <button onClick={onClose} className="p-2 bg-gray-800 rounded-full text-white hover:bg-gray-700">
          <Minimize2 className="w-6 h-6"/>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
         {/* Ingredients Section */}
         <div>
            <h3 className="text-gray-400 uppercase font-bold tracking-widest text-sm mb-4">Ingredients</h3>
            <div className="grid grid-cols-2 gap-4">
               {ingredients.length > 0 ? ingredients.map((ing, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-900 p-4 rounded-xl border border-gray-800">
                     <div className="w-3 h-3 bg-orange-500 rounded-full shrink-0"></div>
                     <div className="flex flex-col">
                        <span className="text-xl text-white font-bold">{ing.name}</span>
                        {/* Show weight if available */}
                        {ing.weight && <span className="text-sm text-gray-500">{ing.weight}</span>}
                     </div>
                  </div>
               )) : (
                 <div className="text-gray-500 italic">No ingredients listed.</div>
               )}
            </div>
         </div>

         {/* Instructions Section */}
         <div>
            <h3 className="text-gray-400 uppercase font-bold tracking-widest text-sm mb-4">Instructions</h3>
            <div className="space-y-6">
               {instructions.length > 0 ? instructions.map((step, i) => (
                  <div 
                    key={i} 
                    onClick={() => setCheckedSteps(p => ({...p, [i]: !p[i]}))} 
                    className={`p-6 rounded-2xl border flex gap-4 cursor-pointer transition-all ${checkedSteps[i] ? 'bg-green-900/20 border-green-600/50 opacity-50' : 'bg-gray-900 border-gray-800 hover:border-gray-600'}`}
                  >
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 ${checkedSteps[i] ? 'bg-green-500 border-green-500 text-black' : 'border-gray-600 text-gray-500'}`}>
                        {checkedSteps[i] ? <Check className="w-5 h-5"/> : <span className="font-bold">{i+1}</span>}
                     </div>
                     <p className="text-2xl text-gray-200 leading-snug">{step}</p>
                  </div>
               )) : (
                 <div className="text-gray-500 italic text-xl">No instructions provided for this meal.</div>
               )}
            </div>
         </div>
      </div>
    </div>
  )
}

export default ChefMode;