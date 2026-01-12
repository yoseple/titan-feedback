import React, { useState } from 'react';
import { Search, Loader, Camera, Wand2, X, Plus } from 'lucide-react';
import { searchAllFood } from '../../utils/nutrition';
import { generateContent } from '../../lib/ai';

const AddFoodModal = ({ mealType, onClose, onAddFood, onScanFood, savedMeals = [] }) => {
  const [activeTab, setActiveTab] = useState('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Manual State
  const [desc, setDesc] = useState('');

  // Unified Search
  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    const res = await searchAllFood(query);
    setResults(res);
    setLoading(false);
  };

  // AI Estimate
  const handleManual = async () => {
    if(!desc) return;
    setLoading(true);
    const prompt = `Estimate nutrition for: "${desc}". Return strictly valid JSON: { "name": "${desc}", "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "weight_amount": "1 serving" }`;
    const data = await generateContent(prompt);
    setLoading(false);
    if(data) onScanFood({ ...data, isManual: true }); 
  };

  return (
    <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in slide-in-from-bottom-10">
       <div className="bg-slate-800 w-full sm:max-w-md h-[85vh] sm:h-[600px] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-700">
          <div className="p-4 border-b border-slate-700 bg-slate-900 flex justify-between items-center">
             <h3 className="font-bold text-white flex gap-2"><Plus className="w-5 h-5 text-emerald-500"/> Add to {mealType}</h3>
             <button onClick={onClose}><X className="text-gray-400 w-6 h-6"/></button>
          </div>
          
          <div className="flex p-2 bg-slate-900 gap-2">
             {['search', 'manual', 'saved'].map(m => (
                <button key={m} onClick={() => setActiveTab(m)} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg ${activeTab === m ? 'bg-slate-700 text-white' : 'text-gray-500 hover:bg-slate-800'}`}>{m === 'saved' ? 'My Meals' : m}</button>
             ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
              {/* SEARCH TAB */}
              {activeTab === 'search' && (
                 <>
                    <div className="relative flex gap-2 mb-4">
                       <input autoFocus type="text" placeholder="Search (e.g. Big Mac, Apple)..." className="w-full bg-slate-900 text-white pl-4 pr-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 border border-slate-700" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSearch()} />
                       <button onClick={handleSearch} className="bg-emerald-600 text-white px-4 rounded-xl font-bold">Go</button>
                    </div>
                    {loading ? <div className="flex justify-center p-8"><Loader className="animate-spin text-emerald-500"/></div> : (
                       <div className="space-y-2">
                          {results.map(food => (
                             <button key={food.id} onClick={() => onAddFood(food)} className="w-full text-left p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-white text-sm">{food.name}</div>
                                    <div className="text-xs text-gray-400 flex gap-2">
                                        <span>{food.brand}</span>
                                        <span className={`px-1 rounded text-[9px] ${food.source === 'USDA' ? 'bg-blue-900 text-blue-300' : 'bg-orange-900 text-orange-300'}`}>{food.source}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-emerald-500">{food.calories}</div>
                                    <div className="text-[10px] text-gray-500">Cal</div>
                                </div>
                             </button>
                          ))}
                          {results.length === 0 && query && !loading && <div className="text-center text-gray-500 py-4">No results found. Try Manual.</div>}
                       </div>
                    )}
                 </>
              )}

              {/* MANUAL TAB */}
              {activeTab === 'manual' && (
                 <div className="space-y-4">
                    <p className="text-sm text-gray-400">Describe the food (e.g. "Grilled Chicken Breast"). You can adjust the weight/amount on the next screen.</p>
                    <textarea value={desc} onChange={e=>setDesc(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white outline-none h-32" placeholder="Description..."/>
                    <button onClick={handleManual} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2">{loading ? <Loader className="animate-spin"/> : <><Wand2 className="w-5 h-5"/> Auto-Log</>}</button>
                 </div>
              )}

              {/* SAVED MEALS TAB */}
              {activeTab === 'saved' && (
                  <div className="space-y-2">
                     {savedMeals.length === 0 ? (
                        <div className="text-center text-gray-500 py-10 text-sm">
                           No saved meals found. <br/> Create them in the <strong>Diet</strong> tab first.
                        </div>
                     ) : (
                        savedMeals.map((m, i) => (
                           <button 
                              key={i} 
                              // FIXED CODE ✅
                                onClick={() => onAddFood({ 
                                    name: m.name, 
                                    calories: m.calories, 
                                    protein: m.protein, 
                                    carbs: m.carbs || 0, // Grabs from 'm', defaults to 0 if missing
                                    fats: m.fats || 0,   // Grabs from 'm', defaults to 0 if missing
                                    weight_amount: '1 Meal' 
                                })}
                              className="w-full text-left p-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl flex justify-between items-center group transition-colors"
                           >
                              <div>
                                 <div className="font-bold text-white text-sm">{m.name}</div>
                                 <div className="text-xs text-gray-400">{m.ingredients?.length || 0} ingredients</div>
                              </div>
                              <div className="text-right">
                                 <div className="font-bold text-emerald-500">{m.calories}</div>
                                 <div className="text-[10px] text-gray-500">kcal</div>
                              </div>
                           </button>
                        ))
                     )}
                  </div>
              )}
          </div>
       </div>
    </div>
  );
};
export default AddFoodModal;