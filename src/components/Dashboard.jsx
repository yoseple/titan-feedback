import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Dumbbell, Utensils, Flame, Loader, Trash2, Activity, Edit2, 
  ChevronLeft, ChevronRight, Send, Bot, Settings, Plus, Check, 
  ShoppingCart, X, Scan
} from 'lucide-react';

// --- IMPORTS ---
import { generateContent } from '../lib/ai';
import { INITIAL_MEALS } from '../data/defaults';
import { useTitanData } from '../hooks/useTitanData'; 
import { categorizeFood, searchUSDA, calculateTDEE } from '../utils/nutrition'; 

// --- MODALS & COMPONENTS ---
import Onboarding from './modals/Onboarding'; // <--- NEW WIZARD IMPORT
import LiftHistoryModal from './modals/LiftHistoryModal';
import WorkoutDayEditor from './modals/WorkoutDayEditor';
import ChefMode from './modals/ChefMode';
import ProfileModal from './modals/ProfileModal';
import AddFoodModal from './modals/AddFoodModal'; 
import ConsistencyHeatmap from './charts/ConsistencyHeatmap';
import CalorieDashboard from './charts/CalorieDashboard';
import ExerciseCard from './cards/ExerciseCard';
import MealCard from './cards/MealCard';

const MEAL_SECTIONS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

// Helper: Fix Date Offsets for Mobile Safari
const getLocalDate = (date) => {
  const d = new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return (new Date(d - offset)).toISOString().slice(0, 10);
};

// Helper: Safely extract numbers from messy database strings
const cleanMacro = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const match = val.toString().match(/(\d+(\.\d+)?)/);
  return match ? Math.round(parseFloat(match[0])) : 0;
};

// Helper: Normalize different API data shapes (USDA vs OpenFoodFacts)
const normalizeFoodData = (item) => {
    let cleanItem = {
        ...item,
        calories: cleanMacro(item.calories || item.kcal || item.energy),
        protein: cleanMacro(item.protein || item.prot || item.proteins),
        carbs: cleanMacro(item.carbs || item.carb || item.carbohydrates || item.carbohydrate),
        fats: cleanMacro(item.fats || item.fat || item.lipid || item.lipids),
        weight_amount: item.weight || item.weight_amount || item.amount || "1 serving"
    };

    // Auto-sum ingredients if main macros are missing
    if (cleanItem.ingredients && Array.isArray(cleanItem.ingredients)) {
        cleanItem.ingredients = cleanItem.ingredients.map(ing => ({
            ...ing,
            calories: cleanMacro(ing.calories),
            protein: cleanMacro(ing.protein),
            carbs: cleanMacro(ing.carbs || ing.carb || ing.carbohydrates),
            fats: cleanMacro(ing.fats || ing.fat),
            weight: ing.weight || ing.weight_amount || '1 serving'
        }));

        if (cleanItem.calories === 0) {
            let c = 0, p = 0, ca = 0, f = 0;
            cleanItem.ingredients.forEach(ing => {
                c += ing.calories; p += ing.protein; ca += ing.carbs; f += ing.fats;
            });
            cleanItem.calories = c; cleanItem.protein = p; cleanItem.carbs = ca; cleanItem.fats = f;
        }
    }
    return cleanItem;
};

const Dashboard = () => {
  const navigate = useNavigate();
  // useTitanData handles all Firebase loading automatically
  const { user, authLoading, workouts, workoutLogs, weightLog, foodLog, customMeals, userProfile, actions } = useTitanData();
  
  const [activeTab, setActiveTab] = useState('workouts');
  const [viewDate, setViewDate] = useState(new Date());
  
  // UI State
  const [chefMeal, setChefMeal] = useState(null); 
  const [editingDayId, setEditingDayId] = useState(null); 
  const [showProfileModal, setShowProfileModal] = useState(false); // Legacy modal (can be removed if using Settings page)
  const [showLiftHistory, setShowLiftHistory] = useState(null);
  
  // Diet State
  const [editingMeal, setEditingMeal] = useState(null); 
  const [selectedMealIds, setSelectedMealIds] = useState([]); 
  const [checkedShoppingItems, setCheckedShoppingItems] = useState({}); 
  const [isFoodSearching, setIsFoodSearching] = useState(false); 
  const [editorSearchQuery, setEditorSearchQuery] = useState('');
  const [editorSearchResults, setEditorSearchResults] = useState([]);

  // Tracker State
  const [addingToMeal, setAddingToMeal] = useState(null); 
  const [scannedResult, setScannedResult] = useState(null);
  const [numServings, setNumServings] = useState(1);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([{ role: 'ai', content: "I am Titan V23. I can update your workout plans and help with diet." }]);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const chatEndRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => { 
    if (activeTab === 'coach') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [chatHistory, activeTab]);

  // --- ACTIONS ---
  // Around line 125 in Dashboard.jsx
const [isEditorSearching, setIsEditorSearching] = useState(false);

  const handleFoodAddFromModal = (foodItem) => {
      const cleanData = normalizeFoodData(foodItem);
      actions.saveFood({
         name: cleanData.name || 'Unknown Item',
         calories: cleanData.calories,
         protein: cleanData.protein,
         carbs: cleanData.carbs, 
         fats: cleanData.fats,
         weight_amount: cleanData.weight_amount
      }, getLocalDate(viewDate), addingToMeal); // <--- Ensure this calls getLocalDate(viewDate)
      setAddingToMeal(null);
  };

  const getDisplayMacros = () => {
      if (!scannedResult) return { c:0, p:0, ca:0, f:0 };
      const base = normalizeFoodData(scannedResult);
      const multiplier = numServings > 0 ? numServings : 0;
      return {
          c: Math.round(base.calories * multiplier),
          p: Math.round(base.protein * multiplier),
          ca: Math.round(base.carbs * multiplier),
          f: Math.round(base.fats * multiplier),
      };
  };

  const handleScanConfirm = () => {
      if (!scannedResult) return;
      const totals = getDisplayMacros();
      const baseAmount = scannedResult.weight_amount || scannedResult.weight || '1 serving';
      const finalWeightLabel = `${numServings} x ${baseAmount}`;

      // If updating an existing log, delete old one first
      if (scannedResult.id && !scannedResult.id.toString().startsWith('usda') && !scannedResult.id.toString().startsWith('off')) {
          actions.deleteFood(scannedResult.id); 
      }
      
      actions.saveFood({
         name: scannedResult.name || 'Unknown Food',
         calories: totals.c, 
         protein: totals.p, 
         carbs: totals.ca, 
         fats: totals.f,    
         weight_amount: finalWeightLabel
      }, getLocalDate(viewDate), addingToMeal || scannedResult.mealType);
      
      setScannedResult(null);
      setAddingToMeal(null);
  };

  const handleFoodSelect = (foodItem) => {
      setNumServings(1); 
      setScannedResult(normalizeFoodData(foodItem));
      setAddingToMeal(foodItem.targetMeal || addingToMeal); 
  };
  
  const handleEditLog = (logItem) => {
      setNumServings(1); 
      setScannedResult({ ...normalizeFoodData(logItem), mealType: logItem.mealType });
  };

  // Recipe Editor Logic
// Dashboard.jsx
    const handleEditorSearch = async () => {
        if(!editorSearchQuery) return;
        
        setIsEditorSearching(true); // Start loading animation
        try {
            const res = await searchUSDA(editorSearchQuery);
            setEditorSearchResults(res);
        } catch (error) {
            console.error("USDA Search Error:", error);
        } finally {
            setIsEditorSearching(false); // Stop loading animation
        }
    };

  const addIngredientToEditor = (foodItem) => {
    if (!editingMeal) return;
    const cleanItem = normalizeFoodData(foodItem);
    setEditingMeal({ 
        ...editingMeal, 
        ingredients: [...(editingMeal.ingredients || []), { ...cleanItem, weight: cleanItem.weight_amount }],
        calories: (editingMeal.calories||0) + cleanItem.calories,
        protein: (editingMeal.protein||0) + cleanItem.protein,
        carbs: (editingMeal.carbs||0) + cleanItem.carbs,
        fats: (editingMeal.fats||0) + cleanItem.fats
    });
    setIsFoodSearching(false); setEditorSearchQuery(''); setEditorSearchResults([]);
  };

  const handleSaveRecipeWrapper = () => { actions.saveRecipe(editingMeal); setEditingMeal(null); };
// src/components/Dashboard.jsx

/// --- HELPER: Fixes "Monday" vs "monday" vs "Mon" bugs ---
  const normalizeId = (input) => {
    if (!input) return null;
    const lower = input.toLowerCase().trim();
    
    // 1. Direct match
    if (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(lower)) {
        return lower;
    }
    
    // 2. Abbreviation mapping
    const map = {
        "mon": "monday", "tue": "tuesday", "tues": "tuesday", 
        "wed": "wednesday", "weds": "wednesday", 
        "thu": "thursday", "thur": "thursday", "thurs": "thursday",
        "fri": "friday", "sat": "saturday", "sun": "sunday"
    };
    return map[lower] || lower; // Fallback to input if no match
  };

  // --- AI HANDLER ---
  const handleChatSubmit = async (e) => {
    e.preventDefault(); 
    if (!chatInput.trim() || isChatProcessing) return;
    
    const msg = chatInput; 
    setChatInput(''); 
    setChatHistory(p => [...p, { role: 'user', content: msg }]); 
    setIsChatProcessing(true);
    
    try {
        // 1. PREPARE CONTEXT (Send simplified schedule to save tokens)
        const simpleSchedule = workouts.map(w => ({ 
            id: w.id, 
            day: w.day, 
            focus: w.focus,
            exercises: w.exercises.map(ex => `${ex.name} (${ex.sets}x${ex.reps})`) 
        }));

        // 2. THE PRODUCTION PROMPT
        const systemPrompt = `
        You are Titan, an elite personal trainer.
        
        CURRENT SCHEDULE:
        ${JSON.stringify(simpleSchedule)}
        
        USER PROFILE:
        Goal: ${userProfile?.goal || 'general fitness'}
        Injuries: ${userProfile?.injuries || 'none'}
        
        USER REQUEST: "${msg}"
        
        YOUR TASK:
        Return a JSON object determining the action.
        
        ACTIONS (Choose One):
        
        1. UPDATE WORKOUTS:
           Return: { "type": "update_plan", "updates": [ { "id": "monday", "day": "Monday", "focus": "...", "exercises": [...] } ] }
           - "id" MUST be the full english day name in lowercase (e.g. "monday").
           - "exercises": Array of { "name", "sets", "reps", "type" (weighted/bodyweight/cardio), "tips" }.
           - TO CLEAR A DAY: Set "exercises": [] (Empty Array).
           - TO MODIFY: Return the FULL list for that day (copy existing ones if keeping them).
           
        2. ADD MEAL:
           Return: { "type": "add_meal", "data": { "name": "...", "calories": 0, "protein": 0, "ingredients": [], "instructions": "..." } }
           - Estimate nutritional values for the meal.
           
        3. ADVICE/CHAT:
           Return: { "type": "advice", "message": "..." }
        
        IMPORTANT rules:
        - If the user mentions an injury (e.g., "bad knees"), REPLACE exercises that aggravate it (e.g., swap Squats for Swimming/Elliptical).
        - JSON ONLY. No markdown.
        `;
        
        // 3. CALL CLOUD FUNCTION
        const data = await generateContent(systemPrompt);

        // 4. PROCESS RESPONSE
        if (!data) throw new Error("No data returned");
        
        if (data.type === 'update_plan') {
             const updates = data.updates || [];
             let confirmationMsg = "Updated: ";
             
             for (const u of updates) {
                // BUG FIX: Normalize ID (Handles "Mon", "Monday", "monday")
                const targetId = normalizeId(u.id || u.day);
                
                if (targetId) {
                    await actions.updateWorkoutPlan(targetId, {
                        ...u,
                        id: targetId, // Ensure DB gets clean ID
                        day: u.day || targetId.charAt(0).toUpperCase() + targetId.slice(1),
                        exercises: Array.isArray(u.exercises) ? u.exercises : []
                    });
                    confirmationMsg += `${targetId.charAt(0).toUpperCase() + targetId.slice(1)}, `;
                }
             }
             setChatHistory(p => [...p, { role: 'ai', content: confirmationMsg.slice(0, -2) + "." }]);
        }
        else if (data.type === 'add_meal') { 
             const cleanMeal = normalizeFoodData(data.data);
             await actions.saveRecipe(cleanMeal); 
             setChatHistory(p => [...p, { role: 'ai', content: `👨‍🍳 Added "${cleanMeal.name}" to your diet plan.` }]);
        }
        else {
             setChatHistory(p => [...p, { role: 'ai', content: data.message || "Done." }]);
        }

    } catch (err) {
        console.error("Chat Error:", err);
        // User-friendly error for Rate Limits
        const errorMsg = err.message.includes('resource-exhausted') 
            ? "Daily limit reached (30/30). Come back tomorrow!" 
            : "I'm having trouble connecting. Try again.";
            
        setChatHistory(p => [...p, { role: 'ai', content: errorMsg }]);
    }
    
    setIsChatProcessing(false);
  };

  // --- RENDER HELPERS ---
// --- RENDER HELPERS ---
  const formattedDate = getLocalDate(viewDate);
  const activeWorkout = workouts.find(w => w.day === viewDate.toLocaleDateString('en-US', { weekday: 'long' })) || workouts[0];

  // FIX: Robust Date Matching
  // This checks if the log date MATCHES "YYYY-MM-DD" OR STARTS WITH it (handling "2026-01-01T15:00...")
  const activeFoodLogs = foodLog.filter(f => {
      if (!f.date) return false;
      return f.date === formattedDate || f.date.startsWith(formattedDate);
  });
  
  const processedExercises = useMemo(() => {
    if (!activeWorkout) return [];
    return activeWorkout.exercises.map(ex => {
      const requiredSets = parseInt(ex.sets) || 1;
      const completedSets = workoutLogs.filter(l => l.date === formattedDate && l.exercise === ex.name).length;
      return { ...ex, isComplete: completedSets >= requiredSets };
    }).sort((a, b) => (a.isComplete === b.isComplete) ? 0 : a.isComplete ? 1 : -1);
  }, [activeWorkout, workoutLogs, formattedDate]);

  const allMeals = [...INITIAL_MEALS, ...customMeals];
  const shoppingList = useMemo(() => {
    if (selectedMealIds.length === 0) return {};
    const categories = {};
    selectedMealIds.forEach(id => {
      const meal = allMeals.find(m => m.id === id);
      if (meal?.ingredients) {
        meal.ingredients.forEach(ing => {
            const cat = ing.category || categorizeFood(ing.name);
            if (!categories[cat]) categories[cat] = [];
            if (!categories[cat].find(x => x.name === ing.name)) categories[cat].push({ name: ing.name, checked: false });
        });
      }
    });
    return categories;
  }, [selectedMealIds, allMeals]);

  // --- CALCULATIONS ---
  // If userProfile is null, we default to 2000, but the Onboarding check handles this mostly.
  const tdee = userProfile?.caloriesTarget || 2500;
  
  const calsConsumed = activeFoodLogs.reduce((acc, curr) => acc + (curr.calories || 0), 0);
  const protConsumed = activeFoodLogs.reduce((acc, curr) => acc + (curr.protein || 0), 0);
  const carbsConsumed = activeFoodLogs.reduce((acc, curr) => acc + (curr.carbs || 0), 0);
  const fatsConsumed = activeFoodLogs.reduce((acc, curr) => acc + (curr.fats || 0), 0);
  const displayMacros = getDisplayMacros();

  // --- LOADING STATES ---
  if (authLoading) return <div className="h-screen flex items-center justify-center bg-gray-900 text-white"><Loader className="animate-spin w-10 h-10 text-blue-500"/></div>;
  
  if (!user) {
      // If auth is done but no user, redirect happens in App.jsx via PrivateRoute
      return null;
  }

  // *** ONBOARDING CHECK ***
  // If user exists but profile is null, show wizard
  if (user && userProfile === null) {
      return <Onboarding onComplete={actions.saveProfile} />;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 font-sans text-gray-100 overflow-hidden relative touch-pan-x selection:bg-blue-500/30">
      
      {/* HEADER (Sticky Top + Safe Area) */}
      <header className="bg-black/80 backdrop-blur-md border-b border-white/10 p-4 pt-safe-top shrink-0 z-20">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
              <h1 className="text-xl font-black italic tracking-tighter text-white flex items-center gap-2">
                  <Flame className="w-5 h-5 text-blue-500 fill-blue-500" /> TITAN
              </h1>
          </div>
          <button 
            onClick={() => navigate('/settings')} 
            className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white border border-gray-700 active:scale-95 transition"
          >
            <Settings className="w-5 h-5"/>
          </button>
        </div>
      </header>

      {/* DATE NAVIGATION */}
      <div className="bg-gray-900 border-b border-gray-800 py-2 shrink-0 z-10 shadow-lg">
        <div className="max-w-5xl mx-auto px-4 flex justify-between items-center">
          <button onClick={() => setViewDate(new Date(viewDate.setDate(viewDate.getDate() - 1)))} className="text-gray-400 hover:text-white p-3 active:scale-90 transition"><ChevronLeft className="w-6 h-6"/></button>
          <div className="text-center">
            <div className="font-bold text-white text-lg">{formattedDate === getLocalDate(new Date()) ? "TODAY" : viewDate.toLocaleDateString('en-US', { weekday: 'long' })}</div>
            <div className="text-xs text-gray-500 font-mono tracking-widest">{formattedDate}</div>
          </div>
          <button onClick={() => setViewDate(new Date(viewDate.setDate(viewDate.getDate() + 1)))} className="text-gray-400 hover:text-white p-3 active:scale-90 transition"><ChevronRight className="w-6 h-6"/></button>
        </div>
      </div>

      {/* MAIN CONTENT (Scrollable) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 scroll-smooth">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* --- WORKOUTS TAB --- */}
          {activeTab === 'workouts' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {activeWorkout ? (
                <>
                  <div className="bg-gradient-to-r from-blue-900/20 to-slate-900 border border-blue-500/20 p-5 rounded-2xl flex justify-between items-center shadow-lg">
                    <div>
                        <h2 className="text-2xl font-black text-white italic uppercase">{activeWorkout.day}</h2>
                        <p className="text-xs text-blue-400 font-bold uppercase tracking-wider mt-1">{activeWorkout.focus}</p>
                    </div>
                    <button onClick={() => setEditingDayId(editingDayId ? null : activeWorkout.id)} className={`p-3 rounded-full border transition active:scale-90 ${editingDayId === activeWorkout.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/5 text-gray-400 border-white/10'}`}>
                        <Edit2 className="w-5 h-5"/>
                    </button>
                  </div>
                  
                  {editingDayId === activeWorkout.id ? (
                      <WorkoutDayEditor dayData={activeWorkout} onSave={(d) => { actions.updateWorkoutPlan(d.id, d); setEditingDayId(null); }} onCancel={() => setEditingDayId(null)} />
                  ) : (
                      <div className="space-y-3 pb-safe-bottom">
                          {processedExercises.map((ex) => (
                              <ExerciseCard 
                                key={ex.name} 
                                ex={ex} 
                                onLog={(n,w,r,d,dur) => actions.saveWorkoutLog({exercise:n, weight:Number(w), reps:Number(r), distance:Number(d), duration:Number(dur)}, formattedDate)} 
                                onDeleteLog={actions.deleteWorkoutLog} 
                                history={workoutLogs} 
                                date={formattedDate} 
                                isComplete={ex.isComplete} 
                                onViewHistory={setShowLiftHistory} 
                                simpleMode={userProfile?.simpleMode} 
                              />
                          ))}
                      </div>
                  )}
                </>
              ) : (
                  <div className="text-center text-gray-500 py-10 flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center"><Activity className="w-8 h-8 opacity-50"/></div>
                      <p>Rest Day. Recover.</p>
                  </div>
              )}
            </div>
          )}

          {/* --- DIET TAB --- */}
          {activeTab === 'diet' && (
            <div className="space-y-6 animate-in fade-in duration-300 pb-safe-bottom">
               <div className="flex justify-between items-end">
                   <h2 className="text-xl font-bold text-white">Meal Plans</h2>
                   <button onClick={() => setEditingMeal({ name: '', calories: 0, protein: 0, carbs: 0, fats: 0, ingredients: [], instructions: '', tags: [] })} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-500 active:scale-95 transition shadow-lg shadow-emerald-900/20">
                       <Plus className="w-4 h-4"/> New
                   </button>
               </div>
               
               <div className="grid md:grid-cols-2 gap-4">
                   {allMeals.length > 0 ? (allMeals.map((meal, i) => (
                       <MealCard key={i} meal={meal} isSelected={selectedMealIds.includes(meal.id)} onToggle={() => setSelectedMealIds(p => p.includes(meal.id) ? p.filter(x=>x!==meal.id) : [...p, meal.id])} onChefMode={setChefMeal} onEdit={setEditingMeal} onDelete={actions.deleteRecipe} />
                   ))) : (
                       <div className="col-span-2 text-center py-12 border-2 border-dashed border-gray-700 rounded-xl bg-gray-800/30">
                           <div className="text-gray-400 text-lg mb-2 font-bold">No meals found.</div>
                           <div className="text-gray-500 text-sm">Create your first meal plan.</div>
                       </div>
                   )}
               </div>
               
               <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 mt-6 shadow-xl">
                   <h3 className="font-bold text-gray-300 uppercase text-xs tracking-widest mb-4 flex items-center gap-2"><ShoppingCart size={16}/> Shopping List ({selectedMealIds.length})</h3>
                   {Object.keys(shoppingList).length === 0 ? (
                       <div className="text-gray-600 text-sm italic text-center py-4">Select meals to generate list.</div>
                   ) : (
                       <div className="grid md:grid-cols-2 gap-6">
                           {Object.keys(shoppingList).map(category => (
                               <div key={category}>
                                   <div className="text-emerald-500 text-[10px] font-bold uppercase mb-2 border-b border-slate-700 pb-1">{category}</div>
                                   <div className="space-y-1">
                                       {shoppingList[category].map((item, idx) => { 
                                           const isChecked = checkedShoppingItems[item.name]; 
                                           return (
                                               <div key={idx} onClick={() => setCheckedShoppingItems(p => ({...p, [item.name]: !p[item.name]}))} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isChecked ? 'opacity-40' : 'hover:bg-slate-700 active:bg-slate-600'}`}>
                                                   <div className={`w-5 h-5 rounded border flex items-center justify-center transition ${isChecked ? 'bg-emerald-600 border-emerald-600' : 'border-gray-500'}`}>
                                                       {isChecked && <Check size={12} className="text-white"/>}
                                                   </div>
                                                   <span className={`text-sm font-medium ${isChecked ? 'line-through text-gray-500' : 'text-gray-300'}`}>{item.name}</span>
                                               </div>
                                           ); 
                                       })}
                                   </div>
                               </div>
                           ))}
                       </div>
                   )}
               </div>
            </div>
          )}

          {/* --- TRACKER TAB --- */}
          {activeTab === 'tracker' && (
            <div className="space-y-6 animate-in fade-in duration-300 pb-safe-bottom">
               <ConsistencyHeatmap workoutLogs={workoutLogs} foodLogs={foodLog} />
               <CalorieDashboard 
                  consumed={calsConsumed} 
                  goal={tdee} 
                  protein={protConsumed} 
                  proteinGoal={Math.round((weightLog[0]?.weight || 180))} 
                  carbs={carbsConsumed} 
                  carbsGoal={250} 
                  fats={fatsConsumed} 
                  fatsGoal={80} 
               />
               
               <div className="space-y-4">
                   {MEAL_SECTIONS.map(mealType => { 
                       const meals = activeFoodLogs.filter(f => f.mealType === mealType); 
                       return (
                           <div key={mealType} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm">
                               <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                       <span className="font-bold text-gray-200 text-sm">{mealType}</span>
                                       <span className="text-xs text-gray-500 font-mono bg-gray-800 px-2 py-1 rounded">{meals.reduce((s,f)=>s+(f.calories||0),0)} Cal</span>
                                   </div>
                                   <button onClick={() => setAddingToMeal(mealType)} className="text-emerald-500 hover:text-emerald-400 p-2 bg-emerald-500/10 rounded-full active:bg-emerald-500/20 transition">
                                       <Plus className="w-5 h-5"/>
                                   </button>
                               </div>
                               <div className="divide-y divide-gray-700/50">
                                   {meals.map(f => (
                                       <div key={f.id} className="p-3 flex justify-between items-center hover:bg-gray-700/30 active:bg-gray-700/50 transition">
                                           <div className="flex-1 pr-4">
                                               <div className="text-sm text-gray-300 font-medium truncate">{f.name}</div>
                                               <div className="text-[10px] text-gray-500 mt-0.5">{f.calories} Cal • {f.protein}g P • {f.weight_amount}</div>
                                           </div>
                                           <div className="flex items-center gap-1">
                                               <button onClick={() => handleEditLog(f)} className="text-gray-500 hover:text-blue-400 p-3 active:scale-90"><Edit2 className="w-4 h-4"/></button>
                                               <button onClick={() => actions.deleteFood(f.id)} className="text-gray-500 hover:text-red-500 p-3 active:scale-90"><Trash2 className="w-4 h-4"/></button>
                                           </div>
                                       </div>
                                   ))}
                                   {meals.length === 0 && <div className="p-4 text-center text-xs text-gray-600 italic">No food logged.</div>}
                               </div>
                           </div>
                       ); 
                   })}
               </div>
            </div>
          )}

          {/* --- COACH TAB --- */}
          {activeTab === 'coach' && (
            <div className="h-[calc(100vh-180px)] flex flex-col animate-in fade-in duration-300">
                <div className="flex-1 bg-gray-800 rounded-t-xl border border-gray-700 border-b-0 overflow-y-auto p-4 space-y-4 shadow-inner">
                    <div className="flex justify-center mb-4"><span className="text-xs font-bold text-gray-600 bg-gray-900 px-3 py-1 rounded-full uppercase tracking-wider">Titan AI Active</span></div>
                    {chatHistory.map((m, i) => (
                        <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
                            <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${m.role==='user'?'bg-blue-600 text-white rounded-br-none':'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {isChatProcessing && <div className="flex justify-start"><div className="bg-gray-700 p-3 rounded-2xl rounded-bl-none"><Loader className="w-4 h-4 animate-spin text-gray-400"/></div></div>}
                    <div ref={chatEndRef}/>
                </div>
                <form onSubmit={handleChatSubmit} className="p-3 bg-gray-900 border-t border-gray-700 flex gap-2 pb-safe-bottom">
                    <input 
                        value={chatInput} 
                        onChange={e=>setChatInput(e.target.value)} 
                        placeholder="Ask Titan..." 
                        className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                    />
                    <button type="submit" disabled={isChatProcessing} className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl disabled:opacity-50 active:scale-95 transition shadow-lg shadow-blue-900/20">
                        <Send className="w-5 h-5"/>
                    </button>
                </form>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER NAV (Fixed Bottom) */}
      <div className="shrink-0 bg-gray-900/95 backdrop-blur-xl border-t border-gray-800 flex justify-around p-2 pb-safe-bottom z-50 shadow-2xl">
         {['workouts', 'diet', 'tracker', 'coach'].map(tab => (
           <button 
             key={tab} 
             onClick={() => setActiveTab(tab)} 
             className={`flex-1 py-3 flex flex-col items-center gap-1.5 transition active:scale-95 rounded-xl ${activeTab === tab ? 'text-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
           >
             {tab === 'workouts' ? <Dumbbell className="w-6 h-6"/> : tab === 'diet' ? <Utensils className="w-6 h-6"/> : tab === 'tracker' ? <Activity className="w-6 h-6"/> : <Bot className="w-6 h-6"/>}
             <span className="text-[10px] font-bold uppercase tracking-wide">{tab}</span>
           </button>
         ))}
      </div>

      {/* --- MODALS (Bottom Sheet Style for Mobile) --- */}
      
      {chefMeal && <ChefMode meal={chefMeal} onClose={() => setChefMeal(null)} />}
      
      {showLiftHistory && <LiftHistoryModal exerciseName={showLiftHistory} history={workoutLogs} onClose={() => setShowLiftHistory(null)} />}
      
      {addingToMeal && !scannedResult && (
          <AddFoodModal 
            mealType={addingToMeal} 
            savedMeals={allMeals} 
            onClose={() => setAddingToMeal(null)} 
            onAddFood={handleFoodAddFromModal} 
            onScanFood={(food) => handleFoodSelect({ ...food, targetMeal: addingToMeal })} 
          />
      )}

      {/* LOG CONFIRMATION MODAL (Bottom Sheet) */}
      {scannedResult && (
        <div className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in slide-in-from-bottom-10">
           <div className="bg-slate-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-700 max-h-[90vh]">
              <div className="p-5 border-b border-slate-700 bg-slate-900 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white truncate max-w-[70%]">{scannedResult.name}</h3>
                  <button onClick={() => { setScannedResult(null); setAddingToMeal(null); }} className="text-gray-400 p-2 bg-gray-800 rounded-full"><X size={20}/></button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto">
                  <div className="flex items-center justify-between bg-slate-900 p-4 rounded-2xl border border-slate-700 shadow-inner">
                      <div className="flex flex-col">
                          <span className="text-gray-400 font-bold uppercase text-xs tracking-wider">Servings</span>
                          <span className="text-xs text-gray-500 mt-1">(1 serv = {scannedResult.weight_amount || '100g'})</span>
                      </div>
                      <div className="flex items-center gap-3">
                          <input 
                              type="number" 
                              inputMode="decimal" 
                              value={numServings} 
                              onChange={e => { const val = parseFloat(e.target.value); setNumServings(isNaN(val) ? '' : val); }} 
                              className="bg-transparent text-white text-4xl font-black w-24 text-right outline-none placeholder-gray-700" 
                              autoFocus
                          />
                          <span className="text-emerald-500 font-black text-xl">x</span>
                      </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                      <div className="bg-slate-900 p-3 rounded-2xl border border-slate-700 text-center">
                          <div className="text-2xl font-black text-white">{displayMacros.c}</div>
                          <div className="text-[10px] uppercase font-bold text-gray-500">Cals</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-2xl border border-blue-900/30 text-center">
                          <div className="text-xl font-bold text-blue-400">{displayMacros.p}</div>
                          <div className="text-[10px] uppercase font-bold text-gray-500">Prot</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-2xl border border-orange-900/30 text-center">
                          <div className="text-xl font-bold text-orange-400">{displayMacros.ca}</div>
                          <div className="text-[10px] uppercase font-bold text-gray-500">Carb</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-2xl border border-yellow-900/30 text-center">
                          <div className="text-xl font-bold text-yellow-400">{displayMacros.f}</div>
                          <div className="text-[10px] uppercase font-bold text-gray-500">Fat</div>
                      </div>
                  </div>
              </div>

              <div className="p-4 bg-slate-900 border-t border-slate-700 pb-safe-bottom">
                  <button onClick={handleScanConfirm} className="w-full bg-emerald-600 active:bg-emerald-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-900/20 flex justify-center items-center gap-2 transition active:scale-95">
                      <Check size={24} /> {scannedResult.id && !scannedResult.id.toString().startsWith('usda') ? 'Update Log' : 'Log Food'}
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* RECIPE EDITOR MODAL */}
      {editingMeal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center justify-center sm:p-4">
            <div className="bg-slate-800 w-full sm:max-w-lg h-[95vh] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 rounded-t-3xl">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900">
                    <h2 className="font-bold text-white text-lg">Edit Meal</h2>
                    <button onClick={() => setEditingMeal(null)} className="text-gray-400 font-medium p-2">Cancel</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <input 
                        value={editingMeal.name} 
                        onChange={e=>setEditingMeal({...editingMeal, name: e.target.value})} 
                        className="w-full bg-slate-700 p-4 rounded-xl text-white text-lg font-bold placeholder-gray-500 outline-none border border-transparent focus:border-emerald-500 transition" 
                        placeholder="Meal Name (e.g. Keto Burger)"
                    />
                    
                    <div className="flex justify-between items-center mt-6">
                        <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">Ingredients</span>
                        <button onClick={() => setIsFoodSearching(true)} className="text-xs font-bold text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-3 py-1.5 rounded-lg active:scale-95">
                            + Add Item
                        </button>
                    </div>

                    <div className="space-y-2">
                        {editingMeal.ingredients?.map((ing, i) => (
                            <div key={i} className="flex justify-between items-center p-3 bg-slate-700/50 rounded-xl border border-white/5">
                                <div>
                                    <div className="text-white text-sm font-medium">{ing.name}</div>
                                    <div className="text-xs text-gray-400 mt-0.5">{ing.weight} • <span className="text-emerald-400">{ing.calories} Cal</span></div>
                                </div>
                                <button onClick={() => { const newIng = [...editingMeal.ingredients]; newIng.splice(i, 1); setEditingMeal({...editingMeal, ingredients: newIng}); }} className="text-red-400 p-2 bg-red-500/10 rounded-lg">
                                    <X size={16}/>
                                </button>
                            </div>
                        ))}
                        {(!editingMeal.ingredients || editingMeal.ingredients.length === 0) && (
                            <div className="text-center py-8 text-gray-600 italic text-sm border-2 border-dashed border-gray-700 rounded-xl">No ingredients yet.</div>
                        )}
                    </div>

                    <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mt-6 mb-2">Instructions</label>
                    <textarea 
                        value={editingMeal.instructions} 
                        onChange={e=>setEditingMeal({...editingMeal, instructions: e.target.value})} 
                        className="w-full bg-slate-700 p-4 rounded-xl text-white h-32 outline-none border border-transparent focus:border-emerald-500 transition resize-none" 
                        placeholder="Step 1: Cook the meat..."
                    />
                </div>
                
                <div className="p-4 bg-slate-900 border-t border-slate-700 pb-safe-bottom">
                    <button onClick={handleSaveRecipeWrapper} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition">
                        Save Recipe
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* FOOD SEARCH MODAL (Overlay) */}
      {isFoodSearching && editingMeal && (
        <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
           <div className="bg-slate-800 w-full sm:max-w-md h-[80vh] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-700 animate-in slide-in-from-bottom-10">
              <div className="p-4 bg-slate-900 border-b border-slate-700 flex gap-2 items-center">
                  <Scan className="text-gray-500" size={20}/>
                  <input 
                      autoFocus 
                      type="text" 
                      placeholder="Search USDA Database..." 
                      className="flex-1 bg-slate-800 text-white px-2 py-2 outline-none text-lg" 
                      value={editorSearchQuery} 
                      onChange={e=>setEditorSearchQuery(e.target.value)} 
                      onKeyDown={e=>e.key==='Enter'&&handleEditorSearch()}
                  />
                  <button onClick={handleEditorSearch} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm">Go</button>
                  <button onClick={() => setIsFoodSearching(false)} className="text-gray-400 p-2"><X size={24}/></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {editorSearchResults.length > 0 ? (editorSearchResults.map(food => (
                      <button key={food.id} onClick={() => addIngredientToEditor(food)} className="w-full text-left p-4 bg-slate-700/30 hover:bg-slate-700 rounded-xl flex justify-between items-center active:scale-95 transition border border-white/5">
                          <div>
                              <div className="font-bold text-white text-sm">{food.name}</div>
                              <div className="text-xs text-gray-400 mt-1">{food.weight_amount}</div>
                          </div>
                          <div className="text-right text-emerald-500 font-bold text-sm bg-emerald-500/10 px-2 py-1 rounded-lg">{food.calories} Cal</div>
                      </button>
                  ))) : (
                      <div className="text-center text-gray-500 mt-10">Type a food name to search.</div>
                  )}
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;