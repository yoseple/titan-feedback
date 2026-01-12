import { useState, useEffect } from 'react';
import { onAuthStateChanged } from "firebase/auth";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  setDoc, 
  getDocs, 
  getDoc,
  where // <--- Added 'where' for filtering
} from "firebase/firestore";
import { auth, db, appId } from '../lib/firebase';
import { DEFAULT_WORKOUTS, INITIAL_MEALS } from '../data/defaults';

export const useTitanData = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Data States
  const [workouts, setWorkouts] = useState([]);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [weightLog, setWeightLog] = useState([]);
  const [foodLog, setFoodLog] = useState([]);
  const [customMeals, setCustomMeals] = useState([]);
  const [userProfile, setUserProfile] = useState(null);

  // 1. AUTH LISTENER
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
       setUser(currentUser);
       setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // 2. DATA SYNC (OPTIMIZED)
  useEffect(() => {
    if (!user) {
        setWorkouts([]); setWorkoutLogs([]); setWeightLog([]); 
        setFoodLog([]); setCustomMeals([]); setUserProfile(null);
        return;
    }
    
    // A. FETCH PROFILE (Unified Path: users/{uid})
    const fetchProfile = async () => {
        const directRef = doc(db, "users", user.uid);
        const directSnap = await getDoc(directRef);
        
        if (directSnap.exists()) {
             setUserProfile(directSnap.data());
        } else {
             setUserProfile(null); // Triggers Onboarding
        }
    };
    fetchProfile();

    // B. FETCH WORKOUT PLAN
    const fetchWorkouts = async () => {
      // We keep workout plans in 'artifacts' for now as they are complex nested objects
      const colRef = collection(db, 'artifacts', appId, 'users', user.uid, 'workout_plan');
      const snapshot = await getDocs(colRef);
      
      if (snapshot.empty) {
        // Initialize Defaults
        Promise.all(DEFAULT_WORKOUTS.map(d => setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'workout_plan', d.id), d)));
        setWorkouts(DEFAULT_WORKOUTS);
      } else {
        const loaded = snapshot.docs.map(d => d.data());
        const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        loaded.sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
        setWorkouts(loaded);
      }
    };
    fetchWorkouts();

    // C. REAL-TIME LISTENERS (Performance Optimized)
    // Only fetch data from the last 30 days to prevent app slowdowns
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateCutoff = thirtyDaysAgo.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // Weight Logs (Keep all for charts, or limit if too heavy)
    const u1 = onSnapshot(query(
        collection(db, 'artifacts', appId, 'users', user.uid, 'weight_logs'), 
        orderBy('date', 'desc')
    ), s => setWeightLog(s.docs.map(d => ({id: d.id, ...d.data()}))));

    // Food Logs (Limit to last 30 days)
    const u2 = onSnapshot(query(
        collection(db, 'artifacts', appId, 'users', user.uid, 'food_logs'), 
        where('date', '>=', dateCutoff), // <--- OPTIMIZATION
        orderBy('date', 'desc')
    ), s => setFoodLog(s.docs.map(d => ({id: d.id, ...d.data()}))));

    // Workout Logs (Limit to last 30 days)
    const u3 = onSnapshot(query(
        collection(db, 'artifacts', appId, 'users', user.uid, 'workout_logs'), 
        where('date', '>=', dateCutoff), // <--- OPTIMIZATION
        orderBy('date', 'desc')
    ), s => setWorkoutLogs(s.docs.map(d => ({id: d.id, ...d.data()}))));

    // Custom Recipes (Fetch All)
    const u4 = onSnapshot(query(
        collection(db, 'artifacts', appId, 'users', user.uid, 'custom_recipes'), 
        orderBy('createdAt', 'desc')
    ), s => setCustomMeals(s.docs.map(d => ({id: d.id, ...d.data()}))));

    return () => { u1(); u2(); u3(); u4(); };
  }, [user]);

  // ACTIONS (Standardized)
  const saveFood = async (foodData, date, mealType) => { 
      if (!user) return; 
      // Ensure date is just the string YYYY-MM-DD
      const dateString = date.includes('T') ? date.split('T')[0] : date;
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'food_logs'), { ...foodData, mealType, date: dateString, createdAt: serverTimestamp() }); 
  };
  
  const deleteFood = async (id) => { if (!user) return; await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'food_logs', id)); };
  
  const saveWorkoutLog = async (logData, date) => { 
      if (!user) return; 
      const dateString = date.includes('T') ? date.split('T')[0] : date;
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'workout_logs'), { ...logData, date: dateString, createdAt: serverTimestamp() }); 
  };
  
  const deleteWorkoutLog = async (id) => { if (!user) return; await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'workout_logs', id)); };
  
  const saveRecipe = async (meal) => { if(!user) return; const m = {...meal, updatedAt: serverTimestamp()}; delete m.id; const isDef = INITIAL_MEALS.some(x=>x.id===meal.id); if(meal.id&&!isDef) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'custom_recipes', meal.id), m, {merge:true}); else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'custom_recipes'), {...m, createdAt: serverTimestamp()}); };
  const deleteRecipe = async (id) => { if (!user) return; await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'custom_recipes', id)); };
  const updateWorkoutPlan = async (id, data) => { if (!user) return; await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'workout_plan', id), data); setWorkouts(p => p.map(w => w.id === id ? data : w)); };
  
  // OPTIMIZED SAVE PROFILE
  const saveProfile = async (newProfile) => {
      if(!user) return;
      // Single source of truth: users/{uid}
      await setDoc(doc(db, "users", user.uid), newProfile, { merge: true });
      setUserProfile(newProfile);
  };

  return {
    user, authLoading, workouts, workoutLogs, weightLog, foodLog, customMeals, userProfile,
    actions: { saveFood, deleteFood, saveWorkoutLog, deleteWorkoutLog, saveRecipe, deleteRecipe, updateWorkoutPlan, saveProfile }
  };
};