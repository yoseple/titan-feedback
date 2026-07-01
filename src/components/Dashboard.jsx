import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Dumbbell, Utensils, Flame, Loader, Trash2, Activity, Edit2, 
  ChevronLeft, ChevronRight, Send, Bot, Settings, Plus, Check, 
  ShoppingCart, X, Scan, Scale, RefreshCw, ChevronDown, Wand2
} from 'lucide-react';

// --- IMPORTS ---
import { generateContent } from '../lib/ai';
import { INITIAL_MEALS, DEFAULT_WORKOUTS } from '../data/defaults';
import { useTitanData } from '../hooks/useTitanData';
import { categorizeFood, searchUSDA, searchAI, computeMacroTargets } from '../utils/nutrition';
import { getLocalDate } from '../utils/date';
import { normalizeFoodData, getBaseGramWeight, convertQuantity, getPortions } from '../domain/foodMath';
import { useFoodLogging } from '../hooks/useFoodLogging';

// --- MODALS & COMPONENTS ---
import Onboarding from './modals/Onboarding'; 
import LiftHistoryModal from './modals/LiftHistoryModal';
import WorkoutDayEditor from './modals/WorkoutDayEditor';
import ChefMode from './modals/ChefMode';
import AddFoodModal from './modals/AddFoodModal'; 
import ConsistencyHeatmap from './charts/ConsistencyHeatmap';
import CalorieDashboard from './charts/CalorieDashboard';
import ExerciseCard from './cards/ExerciseCard';
import MealCard from './cards/MealCard';

const MEAL_SECTIONS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

// --- HELPERS ---
// getLocalDate now lives in ../utils/date (shared with ConsistencyHeatmap so day
// buckets agree). Imported above.

// Food math (parsing, unit conversion, normalization, and the immutable-basis model)
// now lives in ../domain/foodMath (pure + unit-tested). Imported above.

// Helper to normalize day IDs
const normalizeId = (input) => {
    if (!input) return null;
    const lower = input.toLowerCase().trim();
    if (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(lower)) {
        return lower;
    }
    const map = {
        "mon": "monday", "tue": "tuesday", "tues": "tuesday", 
        "wed": "wednesday", "weds": "wednesday", 
        "thu": "thursday", "thur": "thursday", "thurs": "thursday",
        "fri": "friday", "sat": "saturday", "sun": "sunday"
    };
    return map[lower] || lower; 
};

// --- MAIN COMPONENT ---

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, authLoading, workouts: rawWorkouts, workoutLogs, weightLog, foodLog, customMeals, userProfile, actions } = useTitanData();
  // New users have no saved workout docs yet — fall back to the default 7-day plan so the app
  // isn't stuck showing "Rest Day" every day. Onboarding also seeds these; editing a day persists it.
  const workouts = (rawWorkouts && rawWorkouts.length > 0) ? rawWorkouts : DEFAULT_WORKOUTS;

  const [activeTab, setActiveTab] = useState('workouts');
  const [viewDate, setViewDate] = useState(new Date());
  
  // UI State
  const [chefMeal, setChefMeal] = useState(null); 
  const [editingDayId, setEditingDayId] = useState(null); 
  const [showLiftHistory, setShowLiftHistory] = useState(null);
  
  // Diet State
  const [editingMeal, setEditingMeal] = useState(null); 
  const [selectedMealIds, setSelectedMealIds] = useState([]); 
  const [checkedShoppingItems, setCheckedShoppingItems] = useState({}); 
  const [isFoodSearching, setIsFoodSearching] = useState(false); 
  const [editorSearchQuery, setEditorSearchQuery] = useState('');
  const [editorSearchResults, setEditorSearchResults] = useState([]);
  const [isEditorSearching, setIsEditorSearching] = useState(false);
  const [swappingIngIndex, setSwappingIngIndex] = useState(null); 
  const [isAiGeneratingIng, setIsAiGeneratingIng] = useState(false);

  // Food-logging flow (add / scan / edit) lives in its own hook to keep this component lean.
  const {
    addingToMeal, setAddingToMeal, scannedResult, setScannedResult,
    numServings, setNumServings, servingUnit, setServingUnit,
    calculationData, handleFoodSelect, handleUnitChange, handleScanConfirm, handleEditLog,
  } = useFoodLogging({ actions, viewDate });

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([{ role: 'ai', content: "I am Titan. I can update your workout plans and create meals for you." }]);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { 
    if (activeTab === 'coach') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [chatHistory, activeTab]);

  // --- RECIPE EDITOR LOGIC ---
  const handleEditorSearch = async () => {
      if(!editorSearchQuery) return;
      setIsEditorSearching(true); 
      try {
          const res = await searchUSDA(editorSearchQuery);
          setEditorSearchResults(res);
      } catch (error) {
          console.error("USDA Search Error:", error);
      } finally {
          setIsEditorSearching(false); 
      }
  };

  const handleAiIngredientFallback = async () => {
      if(!editorSearchQuery) return;
      setIsAiGeneratingIng(true);
      const result = await searchAI(editorSearchQuery);
      if (result) {
          addIngredientToEditor(result);
      }
      setIsAiGeneratingIng(false);
  };

  const addIngredientToEditor = (foodItem) => {
    if (!editingMeal) return;
    const cleanItem = normalizeFoodData(foodItem);
    const newItem = { ...cleanItem, weight: cleanItem.weight_amount }; 
    
    let newIngredients = [...(editingMeal.ingredients || [])];
    
    if (swappingIngIndex !== null) {
        newIngredients[swappingIngIndex] = newItem;
    } else {
        newIngredients.push(newItem);
    }

    const totals = newIngredients.reduce((acc, curr) => ({
        c: acc.c + curr.calories, p: acc.p + curr.protein, ca: acc.ca + curr.carbs, f: acc.f + curr.fats
    }), {c:0, p:0, ca:0, f:0});

    setEditingMeal({ 
        ...editingMeal, 
        ingredients: newIngredients,
        calories: totals.c, protein: totals.p, carbs: totals.ca, fats: totals.f
    });
    
    setIsFoodSearching(false); 
    setSwappingIngIndex(null); 
    setEditorSearchQuery(''); 
    setEditorSearchResults([]);
  };

  const updateIngredientInRecipe = (index, newValue, newUnit) => {
      const newIngs = [...editingMeal.ingredients];
      const ing = { ...newIngs[index] };
      const oldLabel = ing.weight || "1 serving";
      
      const parts = oldLabel.match(/^(\d+(\.\d+)?)\s*(.*)$/);
      const oldAmount = parts ? parseFloat(parts[1]) : 1;
      const oldUnitStr = parts ? parts[3].toLowerCase().trim() : "serving";
      
      let oldUnit = 'serving';
      if (oldUnitStr.startsWith('g')) oldUnit = 'g';
      if (oldUnitStr.startsWith('oz')) oldUnit = 'oz';
      if (oldUnitStr.startsWith('fl')) oldUnit = 'floz';

      const baseWeight = getBaseGramWeight(oldLabel); 
      
      let adjustedAmount = parseFloat(newValue);

      if (newUnit !== oldUnit && (oldUnit !== 'serving' && newUnit !== 'serving')) {
           adjustedAmount = convertQuantity(oldAmount, oldUnit, newUnit, baseWeight);
           ing.weight = `${adjustedAmount} ${newUnit}`;
      }
      else if (newUnit !== oldUnit && baseWeight) {
          adjustedAmount = convertQuantity(oldAmount, oldUnit, newUnit, baseWeight);
          ing.weight = `${adjustedAmount} ${newUnit}`;
      } else {
          const ratio = adjustedAmount / (oldAmount || 1);
          if (!isNaN(ratio) && ratio !== Infinity && ratio !== 0) {
              ing.calories = Math.round(ing.calories * ratio);
              ing.protein = Math.round(ing.protein * ratio);
              ing.carbs = Math.round(ing.carbs * ratio);
              ing.fats = Math.round(ing.fats * ratio);
          }
          ing.weight = `${adjustedAmount} ${newUnit}`;
      }
      
      newIngs[index] = ing;
      
      const totals = newIngs.reduce((acc, curr) => ({
          c: acc.c + (curr.calories||0), p: acc.p + (curr.protein||0), ca: acc.ca + (curr.carbs||0), f: acc.f + (curr.fats||0)
      }), {c:0, p:0, ca:0, f:0});

      setEditingMeal({ ...editingMeal, ingredients: newIngs, calories: totals.c, protein: totals.p, carbs: totals.ca, fats: totals.f });
  };

  const handleSaveRecipeWrapper = () => { actions.saveRecipe(editingMeal); setEditingMeal(null); };

  // Onboarding completion: save the profile AND seed the default 7-day workout plan so a new
  // user starts with a real, editable plan persisted in Firestore (the client-side fallback
  // above only covers the brief window before these writes land).
  const handleOnboardingComplete = async (profileData) => {
      await actions.saveProfile(profileData);
      try {
          await Promise.all(DEFAULT_WORKOUTS.map(w => actions.updateWorkoutPlan(w.id, w)));
      } catch (e) {
          console.warn('Default workout seeding failed', e);
      }
  };

  // --- AI HANDLER (UPDATED FOR ACTION-FIRST) ---
  const handleChatSubmit = async (e) => {
    e.preventDefault(); 
    if (!chatInput.trim() || isChatProcessing) return;
    
    const msg = chatInput; 
    setChatInput(''); 
    setChatHistory(p => [...p, { role: 'user', content: msg }]); 
    setIsChatProcessing(true);
    
    try {
        const simpleSchedule = workouts.map(w => ({ 
            id: w.id, 
            day: w.day, 
            focus: w.focus,
            exercises: w.exercises.map(ex => `${ex.name} (${ex.sets}x${ex.reps})`) 
        }));

        const systemPrompt = `
You are Titan, a database-management AI for fitness. 
User Goal: ${userProfile?.goal || 'general fitness'}
Injuries: ${userProfile?.injuries || 'none'}
Current Schedule: ${JSON.stringify(simpleSchedule)}

PRIME DIRECTIVE:
You prefer ACTION over SPEECH. 
1. If the user mentions a specific muscle group or workout day, generate a "update_plan" JSON immediately.
2. If the user mentions hunger, specific foods, or diet goals, generate a "add_meal" JSON immediately.
3. Only use "advice" JSON if the user asks a theoretical question (e.g., "Why is sleep important?").

RESPONSE FORMAT (STRICT JSON ONLY):

SCENARIO 1: User says "Give me a chest workout for Monday" or "My chest is lagging"
{
  "type": "update_plan",
  "updates": [
    { 
      "day": "Monday", 
      "focus": "Chest & Triceps Focus", 
      "exercises": [
        { "name": "Barbell Bench Press", "sets": "4", "reps": "6-8", "tips": "Heavy compund", "type": "weighted" },
        { "name": "Incline Dumbbell Press", "sets": "3", "reps": "10-12", "tips": "Upper shelf", "type": "weighted" },
        { "name": "Cable Flys", "sets": "3", "reps": "15", "tips": "Stretch at bottom", "type": "weighted" }
      ]
    }
  ]
}

SCENARIO 2: User says "I want a high protein breakfast" or "Add chicken rice to lunch"
{
  "type": "add_meal",
  "data": { 
      "name": "Titan High-Protein Breakfast", 
      "calories": 650, 
      "protein": 55, 
      "carbs": 45, 
      "fats": 22, 
      "ingredients": [
          { "name": "Egg Whites", "weight": "200g", "calories": 100, "protein": 22, "carbs": 0, "fats": 0 },
          { "name": "Whole Eggs", "weight": "2 large", "calories": 140, "protein": 12, "carbs": 1, "fats": 10 },
          { "name": "Oats", "weight": "60g", "calories": 230, "protein": 8, "carbs": 40, "fats": 4 }
      ],
      "instructions": "1. Scramble eggs.\n2. Cook oats with water.\n3. Combine and season."
  }
}

SCENARIO 3: User says "How do I lose weight?" (Only then use advice)
{ "type": "advice", "message": "To lose weight, you must be in a caloric deficit..." }
Request: "${msg}"
`;
        
        const data = await generateContent(systemPrompt, 'chat'); 

        if (!data) throw new Error("No data returned");
        
        if (data.type === 'update_plan') {
             const updates = data.updates || [];

             for (const u of updates) {
                const targetId = normalizeId(u.id || u.day);
                if (targetId) {
                    await actions.updateWorkoutPlan(targetId, {
                        ...u,
                        id: targetId,
                        day: u.day || targetId.charAt(0).toUpperCase() + targetId.slice(1),
                        exercises: Array.isArray(u.exercises) ? u.exercises : []
                    });
                }
             }
             setChatHistory(p => [...p, { role: 'ai', content: "I've updated your Workout Plan. Swapping tabs now..." }]);
             setTimeout(() => setActiveTab('workouts'), 1500);
        }
        else if (data.type === 'add_meal') { 
             const cleanMeal = normalizeFoodData(data.data);
             await actions.saveRecipe(cleanMeal); 
             setChatHistory(p => [...p, { role: 'ai', content: `👨‍🍳 Added "${cleanMeal.name}" to your diet plan. Taking you there...` }]);
             setTimeout(() => setActiveTab('diet'), 1500);
        }
        else {
             setChatHistory(p => [...p, { role: 'ai', content: data.message || "Done." }]);
        }

    } catch (err) {
        console.error("Chat Error:", err);
        setChatHistory(p => [...p, { role: 'ai', content: "Error connecting to AI." }]);
    }
    
    setIsChatProcessing(false);
  };

  // --- RENDER HELPERS ---
  const formattedDate = getLocalDate(viewDate);
  // Only show the plan that matches today's weekday. If a customized plan has no entry for this
  // day, activeWorkout is undefined and the real "Rest Day" empty state shows (was: always workouts[0],
  // which showed Monday's plan on an unplanned day).
  const activeWorkout = workouts.find(w => w.day === viewDate.toLocaleDateString('en-US', { weekday: 'long' }));

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

  const tdee = userProfile?.caloriesTarget || 2500;
  // Macro goals: use the user's saved targets, else derive them once from calories/goal/weight
  // (single source of truth — replaces the old hardcoded 250/80 + weightLog-derived protein).
  const macroTargets = userProfile?.macroTargets
    || computeMacroTargets(tdee, userProfile?.goal, userProfile?.weight || weightLog[0]?.weight);
  const calsConsumed = activeFoodLogs.reduce((acc, curr) => acc + (curr.calories || 0), 0);
  const protConsumed = activeFoodLogs.reduce((acc, curr) => acc + (curr.protein || 0), 0);
  const carbsConsumed = activeFoodLogs.reduce((acc, curr) => acc + (curr.carbs || 0), 0);
  const fatsConsumed = activeFoodLogs.reduce((acc, curr) => acc + (curr.fats || 0), 0);

  if (authLoading || (user && userProfile === undefined)) return <div className="h-screen flex items-center justify-center bg-gray-900 text-white"><Loader className="animate-spin w-10 h-10 text-blue-500"/></div>;
  if (!user) return null;
  if (user && userProfile === null) return <Onboarding onComplete={handleOnboardingComplete} />;

  return (
    <div className="flex flex-col h-screen bg-slate-900 font-sans text-gray-100 overflow-hidden relative touch-pan-x selection:bg-blue-500/30">
      
      {/* HEADER */}
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
          <button onClick={() => setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })} className="text-gray-400 hover:text-white p-3 active:scale-90 transition"><ChevronLeft className="w-6 h-6"/></button>
          <div className="text-center">
            <div className="font-bold text-white text-lg">{formattedDate === getLocalDate(new Date()) ? "TODAY" : viewDate.toLocaleDateString('en-US', { weekday: 'long' })}</div>
            <div className="text-xs text-gray-500 font-mono tracking-widest">{formattedDate}</div>
          </div>
          <button onClick={() => setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })} className="text-gray-400 hover:text-white p-3 active:scale-90 transition"><ChevronRight className="w-6 h-6"/></button>
        </div>
      </div>

      {/* MAIN CONTENT */}
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
                   {allMeals.map((meal, i) => (
                       <MealCard key={meal.id || i} meal={meal} isSelected={selectedMealIds.includes(meal.id)} onToggle={() => setSelectedMealIds(p => p.includes(meal.id) ? p.filter(x=>x!==meal.id) : [...p, meal.id])} onChefMode={setChefMeal} onEdit={setEditingMeal} onDelete={actions.deleteRecipe} />
                   ))}
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
                 proteinGoal={macroTargets.protein}
                 carbs={carbsConsumed}
                 carbsGoal={macroTargets.carbs}
                 fats={fatsConsumed}
                 fatsGoal={macroTargets.fats}
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
                                           <div className="flex-1 pr-4 min-w-0">
                                               <div className="text-sm text-gray-300 font-medium truncate">{f.name}</div>
                                               <div className="text-[10px] text-gray-500 mt-0.5 truncate">{f.calories} Cal • {f.protein}g P • {f.weight_amount}</div>
                                           </div>
                                           <div className="flex items-center gap-1 shrink-0">
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
                    {isChatProcessing && (
                        <div className="flex justify-start">
                            <div className="bg-gray-700 p-3 rounded-2xl rounded-bl-none">
                                <Loader className="w-4 h-4 animate-spin text-gray-400"/>
                            </div>
                        </div>
                    )}
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
            onAddFood={handleFoodSelect} 
            onScanFood={handleFoodSelect} 
          />
      )}

      {/* --- LOG CONFIRMATION MODAL (SMART UNITS) --- */}
      {scannedResult && (
        <div className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in slide-in-from-bottom-10">
           <div className="bg-slate-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-700 max-h-[90vh]">
              <div className="p-5 border-b border-slate-700 bg-slate-900 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white truncate max-w-[70%]">{scannedResult.name}</h3>
                  <button onClick={() => { setScannedResult(null); setAddingToMeal(null); }} className="text-gray-400 p-2 bg-gray-800 rounded-full hover:bg-gray-700 active:scale-90 transition"><X size={20}/></button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto">
                  {/* Quick portion chips — accurate presets from the food's serving size */}
                  <div className="flex flex-wrap gap-2">
                      {getPortions(scannedResult).map((chip) => {
                          const active = servingUnit === chip.unit && Number(numServings) === chip.quantity;
                          return (
                              <button
                                  key={chip.label}
                                  onClick={() => { setNumServings(chip.quantity); setServingUnit(chip.unit); }}
                                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition active:scale-95 ${active ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-slate-900 border-slate-700 text-gray-300 hover:border-emerald-500/50'}`}
                              >
                                  {chip.label}
                              </button>
                          );
                      })}
                  </div>

                  {/* Amount & Unit Selector */}
                  <div className="flex items-center justify-between bg-slate-900 p-4 rounded-2xl border border-slate-700 shadow-inner">
                      <div className="flex flex-col">
                          <span className="text-gray-400 font-bold uppercase text-xs tracking-wider">Amount</span>
                          <span className="text-xs text-gray-500 mt-1">
                              {calculationData.baseWeight ? `(${calculationData.baseWeight}g per base)` : '(Standard Serving)'}
                          </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                          <input 
                              type="number" 
                              inputMode="decimal" 
                              value={numServings} 
                              onChange={e => { const val = parseFloat(e.target.value); setNumServings(isNaN(val) ? '' : val); }} 
                              className="bg-transparent text-white text-3xl font-black w-24 text-right outline-none placeholder-gray-700 border-b border-gray-700 focus:border-blue-500 transition-colors" 
                              autoFocus
                          />
                          
                          {/* Unit Dropdown */}
                          <div className="relative">
                              <select 
                                  value={servingUnit} 
                                  onChange={(e) => handleUnitChange(e.target.value)}
                                  className="appearance-none bg-gray-800 text-emerald-400 font-bold text-sm px-3 py-2 rounded-lg border border-gray-700 outline-none focus:border-emerald-500 pr-8"
                              >
                                  {/* Weight units only make sense when the food has a known gram base.
                                      For serving-only foods (no parseable grams) we hide g/oz/floz so the
                                      amount can't be reinterpreted as grams and blow the macros up ~100x. */}
                                  <option value="serving">Serving</option>
                                  {calculationData.baseWeight && (
                                    <>
                                      <option value="g">Grams</option>
                                      <option value="oz">Oz</option>
                                      <option value="floz">Fl Oz</option>
                                    </>
                                  )}
                              </select>
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                  <ChevronDown size={12} />
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Macros Grid */}
                  <div className="grid grid-cols-4 gap-3">
                      <div className="bg-slate-900 p-3 rounded-2xl border border-slate-700 text-center">
                          <div className="text-2xl font-black text-white">{calculationData.c}</div>
                          <div className="text-[10px] uppercase font-bold text-gray-500">Cals</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-2xl border border-blue-900/30 text-center">
                          <div className="text-xl font-bold text-blue-400">{calculationData.p}</div>
                          <div className="text-[10px] uppercase font-bold text-gray-500">Prot</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-2xl border border-orange-900/30 text-center">
                          <div className="text-xl font-bold text-orange-400">{calculationData.ca}</div>
                          <div className="text-[10px] uppercase font-bold text-gray-500">Carb</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-2xl border border-yellow-900/30 text-center">
                          <div className="text-xl font-bold text-yellow-400">{calculationData.f}</div>
                          <div className="text-[10px] uppercase font-bold text-gray-500">Fat</div>
                      </div>
                  </div>
              </div>

              <div className="p-4 bg-slate-900 border-t border-slate-700 pb-safe-bottom">
                  <button onClick={handleScanConfirm} className="w-full bg-emerald-600 active:bg-emerald-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-900/20 flex justify-center items-center gap-2 transition active:scale-95">
                      <Check size={24} /> {scannedResult.id && !scannedResult.id.toString().startsWith('usda') && !scannedResult.id.toString().startsWith('off') && !scannedResult.id.toString().startsWith('ai_') ? 'Update Log' : 'Log Food'}
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* --- RECIPE EDITOR MODAL (IMPROVED UI & FUNCTIONALITY) --- */}
      {editingMeal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center justify-center sm:p-4">
            <div className="bg-slate-800 w-full sm:max-w-lg h-[95vh] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 rounded-t-3xl border border-slate-700">
                
                {/* Modal Header */}
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900">
                    <div>
                        <h2 className="font-bold text-white text-lg">Edit Meal</h2>
                        <div className="flex gap-2 text-xs font-mono mt-1">
                            <span className="text-emerald-400">{editingMeal.calories} Cals</span>
                            <span className="text-gray-500">|</span>
                            <span className="text-blue-400">{editingMeal.protein}P</span>
                            <span className="text-orange-400">{editingMeal.carbs}C</span>
                            <span className="text-yellow-400">{editingMeal.fats}F</span>
                        </div>
                    </div>
                    <button onClick={() => setEditingMeal(null)} className="text-gray-400 font-medium p-2 bg-slate-800 rounded-lg hover:text-white transition">Cancel</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    {/* Name Input */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Meal Name</label>
                        <input 
                            value={editingMeal.name} 
                            onChange={e=>setEditingMeal({...editingMeal, name: e.target.value})} 
                            className="w-full bg-slate-700 p-4 rounded-xl text-white text-lg font-bold placeholder-gray-500 outline-none border border-transparent focus:border-emerald-500 transition shadow-inner" 
                            placeholder="e.g. Keto Burger"
                        />
                    </div>
                    
                    {/* Ingredients Section */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ingredients ({editingMeal.ingredients?.length || 0})</span>
                            <button onClick={() => setIsFoodSearching(true)} className="text-xs font-bold text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-3 py-2 rounded-lg active:scale-95 border border-emerald-500/20 hover:bg-emerald-500/20 transition">
                                <Plus size={14}/> Add Item
                            </button>
                        </div>

                        <div className="space-y-3">
                            {editingMeal.ingredients?.map((ing, i) => {
                                const parts = (ing.weight || "1 serving").match(/^(\d+(\.\d+)?)\s*(.*)$/);
                                const val = parts ? parts[1] : 1;
                                const unitStr = parts ? parts[3].toLowerCase().trim() : "serving";
                                
                                let unit = 'serving';
                                if (unitStr.startsWith('g')) unit = 'g';
                                else if (unitStr.startsWith('oz')) unit = 'oz';
                                else if (unitStr.startsWith('fl')) unit = 'floz';
                                
                                return (
                                    <div key={i} className="flex flex-col gap-3 p-4 bg-slate-700/30 rounded-xl border border-white/5 shadow-sm">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="text-white text-sm font-bold flex items-center gap-2">
                                                    {ing.name}
                                                    <button onClick={() => { setSwappingIngIndex(i); setIsFoodSearching(true); }} className="text-blue-400 hover:text-blue-300 p-1.5 rounded-full hover:bg-blue-400/10 transition" title="Swap Ingredient">
                                                        <RefreshCw size={12}/>
                                                    </button>
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-1 flex gap-2">
                                                    <span className="text-emerald-400 font-mono">{ing.calories} Cal</span>
                                                    <span>{ing.protein}p {ing.carbs}c {ing.fats}f</span>
                                                </div>
                                            </div>
                                            
                                            {/* DELETE BUTTON */}
                                            <button 
                                                onClick={() => { 
                                                    const newIng = [...editingMeal.ingredients]; 
                                                    newIng.splice(i, 1); 
                                                    const totals = newIng.reduce((acc, curr) => ({
                                                        c: acc.c + (curr.calories || 0), 
                                                        p: acc.p + (curr.protein || 0), 
                                                        ca: acc.ca + (curr.carbs || 0), 
                                                        f: acc.f + (curr.fats || 0)
                                                    }), {c:0, p:0, ca:0, f:0});

                                                    setEditingMeal({
                                                        ...editingMeal, 
                                                        ingredients: newIng,
                                                        calories: totals.c,
                                                        protein: totals.p,
                                                        carbs: totals.ca,
                                                        fats: totals.f
                                                    }); 
                                                }} 
                                                className="text-red-400 p-2 bg-red-500/10 rounded-lg hover:bg-red-500/20 active:scale-95 transition"
                                            >
                                                <X size={16}/>
                                            </button>
                                        </div>
                                        
                                        {/* Smart Ingredient Controls */}
                                        <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded-lg border border-white/5">
                                            <div className="text-xs text-gray-500 font-bold uppercase mr-1">Qty:</div>
                                            <input 
                                                type="number" 
                                                value={val} 
                                                onChange={e => updateIngredientInRecipe(i, e.target.value, unit)} 
                                                className="w-16 bg-transparent text-white text-center font-bold text-sm outline-none border-b border-gray-600 focus:border-emerald-500 transition-colors"
                                            />
                                            <div className="h-4 w-px bg-gray-700 mx-1"></div>
                                            <select 
                                                value={unit} 
                                                onChange={e => updateIngredientInRecipe(i, val, e.target.value)}
                                                className="bg-transparent text-xs text-gray-300 font-bold outline-none uppercase flex-1"
                                            >
                                                {/* <option value="serving">Serving</option> */}
                                                <option value="g">Grams</option>
                                                <option value="oz">Ounces</option>
                                                <option value="floz">Fl Oz</option>
                                            </select>
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {(!editingMeal.ingredients || editingMeal.ingredients.length === 0) && (
                                <div className="text-center py-10 text-gray-500 text-sm border-2 border-dashed border-gray-700 rounded-xl bg-gray-800/50">
                                    <div className="mb-2">🥗</div>
                                    No ingredients yet.<br/>Tap "+ Add Item" to start building.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Instructions */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4">Instructions</label>
                        <textarea 
                            value={editingMeal.instructions} 
                            onChange={e=>setEditingMeal({...editingMeal, instructions: e.target.value})} 
                            className="w-full bg-slate-700 p-4 rounded-xl text-white h-32 outline-none border border-transparent focus:border-emerald-500 transition resize-none shadow-inner text-sm leading-relaxed" 
                            placeholder="Step 1: Prep your ingredients..."
                        />
                    </div>
                </div>
                
                {/* Save Button */}
                <div className="p-4 bg-slate-900 border-t border-slate-700 pb-safe-bottom">
                    <button onClick={handleSaveRecipeWrapper} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition hover:bg-emerald-500 flex justify-center items-center gap-2">
                        <Check size={20}/> Save Recipe
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
                  <button onClick={handleEditorSearch} disabled={isEditorSearching} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm min-w-[60px] flex items-center justify-center">
                    {isEditorSearching ? <Loader className="w-4 h-4 animate-spin"/> : 'Go'}
                  </button>
                  <button onClick={() => setIsFoodSearching(false)} className="text-gray-400 p-2"><X size={24}/></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {isEditorSearching ? (
                      <div className="flex flex-col items-center justify-center h-48 space-y-3">
                        <Loader className="w-8 h-8 animate-spin text-emerald-500" />
                        <span className="text-gray-500 text-sm">Searching USDA...</span>
                      </div>
                  ) : (
                      <>
                        {editorSearchResults.length > 0 ? (
                            editorSearchResults.map(food => (
                              <button key={food.id} onClick={() => addIngredientToEditor(food)} className="w-full text-left p-4 bg-slate-700/30 hover:bg-slate-700 rounded-xl flex justify-between items-center active:scale-95 transition border border-white/5">
                                  <div>
                                      <div className="font-bold text-white text-sm">{food.name}</div>
                                      <div className="text-xs text-gray-400 mt-1">{food.weight_amount}</div>
                                  </div>
                                  <div className="text-right text-emerald-500 font-bold text-sm bg-emerald-500/10 px-2 py-1 rounded-lg">{food.calories} Cal</div>
                              </button>
                            ))
                        ) : (
                            <div className="text-center text-gray-500 mt-10">
                                {editorSearchQuery ? "No results found." : "Type a food name to search."}
                            </div>
                        )}

                        {/* AI FALLBACK BUTTON */}
                        {editorSearchQuery && !isEditorSearching && (
                            <div className="mt-4 pt-4 border-t border-slate-700 text-center px-4">
                                <button 
                                    onClick={handleAiIngredientFallback}
                                    disabled={isAiGeneratingIng}
                                    className="w-full py-3 bg-indigo-600/20 text-indigo-400 rounded-xl font-bold flex items-center justify-center gap-2 border border-indigo-500/50 hover:bg-indigo-600/30 transition shadow-lg shadow-indigo-900/20"
                                >
                                    {isAiGeneratingIng ? <Loader className="w-4 h-4 animate-spin"/> : <><Wand2 size={16}/> Generate AI Estimate</>}
                                </button>
                                <p className="text-[10px] text-gray-500 mt-2">Use AI if you can't find the exact ingredient.</p>
                            </div>
                        )}
                      </>
                  )}
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;