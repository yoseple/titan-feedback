import React, { useState } from 'react';
import { Check, Plus, ChevronUp, ChevronDown, Edit2, Trash2, ChefHat } from 'lucide-react';

const MealCard = ({ meal, isSelected, onToggle, onChefMode, onEdit, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className={`rounded-xl border overflow-hidden mb-3 transition-all duration-200 ${isSelected ? 'bg-red-900/10 border-red-500/50' : 'bg-gray-800 border-gray-700'}`}>
      <div role="button" tabIndex={0} aria-expanded={isExpanded} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded(v => !v); } }} className="p-4 flex justify-between items-center cursor-pointer active:bg-gray-700/50" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 mb-1"><h4 className={`font-bold text-sm truncate ${isSelected ? 'text-red-400' : 'text-gray-100'}`}>{meal.name}</h4>{isSelected && <Check className="w-4 h-4 text-red-500 shrink-0"/>}</div>
          <div className="flex gap-2"><span className="text-[10px] bg-gray-900 px-2 py-0.5 rounded text-gray-400 font-mono border border-gray-700">{meal.calories} CAL</span>{meal.tags && meal.tags.slice(0,2).map((t, i) => <span key={i} className="text-[10px] bg-gray-700/50 px-2 py-0.5 rounded text-gray-400 hidden sm:inline-block">{t}</span>)}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
           <button aria-label={isSelected ? 'Deselect meal' : 'Select meal'} onClick={(e) => { e.stopPropagation(); onToggle(); }} className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-red-600 border-red-600 text-white' : 'border-gray-500 text-gray-500'}`}>{isSelected ? <Check className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}</button>
           {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400"/> : <ChevronDown className="w-5 h-5 text-gray-400"/>}
        </div>
      </div>
      {isExpanded && (
        <div className="p-4 bg-gray-900/30 border-t border-gray-700/50 animate-in slide-in-from-top-2">
           <div className="flex justify-between items-center mb-3">
              <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Details</h5>
              <div className="flex gap-2">
                <button aria-label="Edit meal" onClick={(e) => { e.stopPropagation(); onEdit(meal); }} className="p-1.5 text-gray-400 hover:text-white bg-gray-800 rounded"><Edit2 className="w-3 h-3"/></button>
                <button aria-label="Delete meal" onClick={(e) => { e.stopPropagation(); onDelete(meal.id); }} className="p-1.5 text-gray-400 hover:text-red-500 bg-gray-800 rounded"><Trash2 className="w-3 h-3"/></button>
                <button onClick={(e) => { e.stopPropagation(); onChefMode(meal); }} className="flex items-center gap-1 text-xs font-bold text-orange-400 hover:text-orange-300 border border-orange-400/30 px-2 py-1 rounded-lg"><ChefHat className="w-3 h-3"/> Chef Mode</button>
              </div>
           </div>
           <div className="mb-4 flex flex-wrap gap-2">{meal.ingredients && meal.ingredients.map((ing, i) => (<span key={i} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-600">{ing.name}</span>))}</div>
        </div>
      )}
    </div>
  )
}
export default MealCard;