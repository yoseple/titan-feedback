import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Search, Loader, Wand2, X, Plus, Clock, Bookmark, ScanBarcode, Camera, Trash2, Flame } from 'lucide-react';

// Defer the QR scanner (a wasm engine) until the Scan tab is actually opened.
const Scanner = lazy(() => import('@yudiel/react-qr-scanner').then((m) => ({ default: m.Scanner })));
import { searchAllFood, getSuggestions, searchByBarcode, searchAI } from '../../utils/nutrition';
import { generateContent } from '../../lib/ai';
import { useTitanData } from '../../hooks/useTitanData';
import { useToast } from '../Toast';

// Debounce Helper
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

// --- UPDATED FOOD ITEM COMPONENT ---
// Changed to a flex container so we can have a Delete button side-by-side
const FoodItem = ({ food, onClick, type, onDelete }) => (
    <div className="w-full flex items-center gap-2 mb-1 group relative">
        <button onClick={onClick} className="flex-1 text-left p-3 bg-slate-700/30 hover:bg-slate-700 rounded-xl flex justify-between items-center transition border border-white/5 active:scale-[0.99]">
            <div>
                <div className="font-bold text-white text-sm group-hover:text-emerald-400">{food.name}</div>
                <div className="text-xs text-gray-400">{food.brand || 'Generic'} • {food.weight_amount}</div>
            </div>
            <div className="text-right">
                <div className="font-bold text-emerald-500">{food.calories}</div>
                <div className="text-[10px] text-gray-500">kcal</div>
            </div>
        </button>
        
        {/* DELETE BUTTON: Only shows for 'history' type if onDelete is provided */}
        {type === 'history' && onDelete && (
            <button 
                onClick={(e) => { 
                    e.stopPropagation(); // Prevent opening the "Add Food" modal
                    onDelete(food.id); 
                }}
                className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition h-full flex items-center justify-center border border-red-500/20 active:scale-90"
                title="Remove from history"
            >
                <Trash2 size={16} />
            </button>
        )}
    </div>
);

const AddFoodModal = ({ mealType, onClose, onAddFood, onScanFood, onDeleteHistory, savedMeals = [] }) => {
  const { foodHistory } = useTitanData();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('search');
  const [query, setQuery] = useState('');
  
  // --- SCANNER STATE ---
  const [isScanning, setIsScanning] = useState(false);
  const [scanActive, setScanActive] = useState(false); 
  const [scanStatus, setScanStatus] = useState('Ready'); 

  // Search State
  const [dbSuggestions, setDbSuggestions] = useState([]);
  const [webResults, setWebResults] = useState([]);
  const [isWebSearching, setIsWebSearching] = useState(false);
  const [hasSearchedWeb, setHasSearchedWeb] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false); 
  const debouncedQuery = useDebounce(query, 300);

  // --- 1. SEARCH LOGIC ---
  const historyMatches = useMemo(() => {
    if (!query) return foodHistory.slice(0, 10);
    const lower = query.toLowerCase();
    return foodHistory.filter(item => item.name.toLowerCase().includes(lower)).slice(0, 5);
  }, [query, foodHistory]);

  useEffect(() => {
    async function fetchSuggestions() {
        if (debouncedQuery.length < 2) { setDbSuggestions([]); return; }
        if (!hasSearchedWeb) {
            const results = await getSuggestions(debouncedQuery);
            setDbSuggestions(results.filter(r => !foodHistory.some(h => h.name === r.name)));
        }
    }
    fetchSuggestions();
  }, [debouncedQuery]);

  const handleDeepSearch = async () => {
    if (!query) return;
    setIsWebSearching(true);
    setHasSearchedWeb(true);
    const res = await searchAllFood(query);
    setWebResults(res);
    setIsWebSearching(false);
  };

  const handleAiFallback = async () => {
      if (!query) return;
      setIsAiGenerating(true);
      const result = await searchAI(query);
      if (result) {
          setWebResults(prev => [result, ...prev]);
      }
      setIsAiGenerating(false);
  };

  // --- 2. SCANNER LOGIC (SILENT) ---
  const handleScan = async (result) => {
      if (!scanActive) return;
      if (result) {
          setScanActive(false); 
          setIsScanning(false); 
          const rawCode = result[0]?.rawValue || result; 
          setIsWebSearching(true); 
          
          const product = await searchByBarcode(rawCode);
          setIsWebSearching(false);
          
          if (product) {
              onScanFood(product);
          } else {
              toast("Product not found in database.", 'error');
          }
      }
  };

  const triggerScan = () => {
      setScanActive(true);
      setScanStatus('Searching');
      setTimeout(() => {
          setScanActive((current) => {
              if (current) { 
                  setScanStatus('Failed');
                  return false; 
              }
              return false;
          });
      }, 5000);
  };

  // --- 3. MANUAL TAB ---
  const [desc, setDesc] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const handleManual = async () => {
    if(!desc) return;
    setAiLoading(true);
    const prompt = `Estimate nutrition for: "${desc}". Return strictly valid JSON: { "name": "${desc}", "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "weight_amount": "1 serving" }`;
    // generateContent RE-THROWS on quota exhaustion (unlike the searchAI wrappers), so
    // clear the loading flag in finally — otherwise the button stays a disabled spinner
    // forever, with no error, until the modal is remounted.
    try {
      const data = await generateContent(prompt, 'search');
      if(data) onScanFood({ ...data, isManual: true });
    } catch (e) {
      toast(e?.message || 'AI unavailable — try again later.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in slide-in-from-bottom-10">
       <div className="bg-slate-800 w-full sm:max-w-md h-[90dvh] sm:h-[650px] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-700">
          
          <div className="p-4 border-b border-slate-700 bg-slate-900 flex justify-between items-center shrink-0">
             <h3 className="font-bold text-white flex gap-2"><Plus className="w-5 h-5 text-emerald-500"/> Add to {mealType}</h3>
             <button onClick={onClose}><X className="text-gray-400 w-6 h-6"/></button>
          </div>
          
          <div className="flex p-2 bg-slate-900 gap-2 border-b border-slate-700/50 shrink-0">
             <button onClick={() => {setActiveTab('search'); setIsScanning(false);}} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-1 transition-colors ${activeTab === 'search' && !isScanning ? 'bg-slate-700 text-white' : 'text-gray-500 hover:bg-slate-800'}`}><Search size={14}/> Search</button>
             <button onClick={() => {setIsScanning(true); setScanStatus('Ready');}} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-1 transition-colors ${isScanning ? 'bg-slate-700 text-white' : 'text-gray-500 hover:bg-slate-800'}`}><ScanBarcode size={14}/> Scan</button>
             <button onClick={() => {setActiveTab('saved'); setIsScanning(false);}} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-1 transition-colors ${activeTab === 'saved' ? 'bg-slate-700 text-white' : 'text-gray-500 hover:bg-slate-800'}`}><Bookmark size={14}/> Saved</button>
             <button onClick={() => {setActiveTab('manual'); setIsScanning(false);}} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-1 transition-colors ${activeTab === 'manual' ? 'bg-slate-700 text-white' : 'text-gray-500 hover:bg-slate-800'}`}><Wand2 size={14}/> AI</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 scroll-smooth relative">
              
              {/* SCANNER */}
              {isScanning && (
                  <div className="h-full flex flex-col items-center justify-start pt-4 relative">
                      <div className="w-full aspect-square max-w-sm rounded-3xl overflow-hidden border-2 border-emerald-500/50 relative bg-black shadow-2xl">
                          <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-black"><Loader className="w-10 h-10 animate-spin text-emerald-500"/></div>}>
                            <Scanner
                               onScan={handleScan}
                               options={{ delayBetweenScanAttempts: 200 }}
                               components={{ audio: false, finder: false }} // SILENT MODE
                               allowMultiple={true}
                            />
                          </Suspense>
                          <div className="absolute inset-0 border-[30px] border-black/50 pointer-events-none"></div>
                          
                          {/* VISUAL INDICATOR */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <div className="w-64 h-40 border-2 border-white/50 rounded-lg relative">
                                  <div className="absolute top-2 left-0 right-0 text-center text-white/80 text-xs font-bold tracking-widest bg-black/40 py-1">SCAN BARCODE</div>
                              </div>
                          </div>

                          {scanStatus === 'Searching' && (<div className="absolute inset-0 bg-black/20 flex items-center justify-center"><Loader className="w-12 h-12 text-emerald-500 animate-spin"/></div>)}
                      </div>
                      <div className="mt-8 flex flex-col items-center gap-4">
                          {scanStatus === 'Failed' && (<div className="bg-red-500/10 text-red-400 px-4 py-2 rounded-lg text-sm font-bold border border-red-500/20 animate-in fade-in">No barcode found. Try closer.</div>)}
                          
                          <button onClick={triggerScan} disabled={scanStatus === 'Searching'} className={`relative w-20 h-20 rounded-full border-4 border-white shadow-xl flex items-center justify-center transition-all ${scanStatus === 'Searching' ? 'bg-white/10 scale-95 opacity-80' : 'bg-transparent hover:bg-white/10 active:scale-90'}`}>
                              <div className={`w-16 h-16 bg-white rounded-full transition-all ${scanStatus === 'Searching' ? 'scale-75' : 'scale-100'}`}></div>
                              <Camera className="absolute text-gray-400 w-8 h-8 opacity-0 hover:opacity-100 transition-opacity" />
                          </button>
                          <p className="text-gray-400 text-sm font-medium">{scanStatus === 'Searching' ? 'Analyzing...' : 'Tap to Scan'}</p>
                      </div>
                  </div>
              )}

              {/* SEARCH */}
              {activeTab === 'search' && !isScanning && (
                 <>
                    <div className="relative flex gap-2 mb-6">
                       <div className="relative flex-1">
                           <input autoFocus type="text" placeholder="Search foods (e.g. Light Tuna)..." className="w-full bg-slate-900 text-white pl-10 pr-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 border border-slate-700" value={query} onChange={e => { setQuery(e.target.value); setHasSearchedWeb(false); }} onKeyDown={e => e.key === 'Enter' && handleDeepSearch()} />
                           <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
                       </div>
                       {query && <button onClick={handleDeepSearch} className="bg-emerald-600 text-white px-4 rounded-xl font-bold">Go</button>}
                    </div>

                    <div className="space-y-1">
                        {/* History with DELETE functionality */}
                        {historyMatches.length > 0 && !hasSearchedWeb && (
                            <div className="mb-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 pl-2 flex items-center gap-1"><Clock size={12}/> Recent</h4>
                                {historyMatches.map((food, i) => (
                                    <FoodItem 
                                        key={`hist-${i}`} 
                                        food={food} 
                                        onClick={() => onAddFood(food)} 
                                        type="history" 
                                        onDelete={onDeleteHistory} // <--- Pass Delete Handler Here
                                    />
                                ))}
                            </div>
                        )}
                        
                        {/* Improved Suggestions */}
                        {dbSuggestions.length > 0 && !hasSearchedWeb && (
                            <div className="mb-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 pl-2 flex items-center gap-1"><Flame size={12}/> Popular / Cached</h4>
                                {dbSuggestions.map((food, i) => <FoodItem key={`db-${i}`} food={food} onClick={() => onAddFood(food)} type="db" />)}
                            </div>
                        )}
                        
                        {/* Web Results */}
                        {isWebSearching ? (
                            <div className="flex flex-col items-center py-10 gap-3"><Loader className="animate-spin text-emerald-500"/><span className="text-gray-400 text-sm">Searching Global Database...</span></div>
                        ) : hasSearchedWeb && (
                             <>
                                {webResults.length > 0 ? (
                                    webResults.map((food, i) => <FoodItem key={`web-${i}`} food={food} onClick={() => onAddFood(food)} type="web" />)
                                ) : (
                                    <div className="text-center text-gray-500 py-4">No direct matches found.</div>
                                )}
                                
                                <div className="mt-6 pt-6 border-t border-slate-700 flex flex-col items-center gap-3">
                                    <span className="text-gray-500 text-xs">Can't find exactly what you want?</span>
                                    <button 
                                        onClick={handleAiFallback} 
                                        disabled={isAiGenerating}
                                        className="w-full bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 py-3 rounded-xl font-bold flex justify-center items-center gap-2 border border-indigo-500/50 transition"
                                    >
                                        {isAiGenerating ? <Loader className="animate-spin w-4 h-4"/> : <><Wand2 className="w-4 h-4"/> Generate AI Estimate</>}
                                    </button>
                                </div>
                             </>
                        )}
                    </div>
                 </>
              )}

              {/* SAVED & MANUAL TABS */}
              {activeTab === 'saved' && !isScanning && (
                  <div className="space-y-2">
                     {savedMeals.length === 0 ? <div className="text-center text-gray-500 py-10">No saved meals.</div> : savedMeals.map((m, i) => <FoodItem key={i} food={{...m, weight_amount: '1 Meal'}} onClick={() => onAddFood(m)} type="saved"/>)}
                  </div>
              )}
              {activeTab === 'manual' && !isScanning && (
                 <div className="space-y-4 pt-2">
                    <p className="text-sm text-gray-400">Describe the food...</p>
                    <textarea value={desc} onChange={e=>setDesc(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white h-32" placeholder="e.g. 2 slices of pizza..."/>
                    <button onClick={handleManual} disabled={aiLoading || !desc} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold flex justify-center items-center gap-2">{aiLoading ? <Loader className="animate-spin"/> : <><Wand2 className="w-5 h-5"/> Estimate Macros</>}</button>
                 </div>
              )}
          </div>
       </div>
    </div>
  );
};

export default AddFoodModal;