import { useState, useEffect } from 'react';
import { 
  collection, query, onSnapshot, doc, 
  addDoc, deleteDoc, updateDoc, setDoc, orderBy, limit, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export const useTitanData = () => {
  const { currentUser: user, loading: authLoading } = useAuth();
  
  const [workouts, setWorkouts] = useState([]);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [weightLog, setWeightLog] = useState([]);
  const [foodLog, setFoodLog] = useState([]);
  const [customMeals, setCustomMeals] = useState([]);
  const [userProfile, setUserProfile] = useState(undefined); 
  const [foodHistory, setFoodHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // FIX: Must match your deployed database folder exactly
  const appId = "titan-73b02"; 

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      setUserProfile(null);
      return;
    }

    // Refs - Pointing to "titan-73b02"
    const userRef = doc(db, 'artifacts', appId, 'users', user.uid);
    const workoutsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'workouts');
    const logsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'workout_logs');
    const weightRef = collection(db, 'artifacts', appId, 'users', user.uid, 'weight_logs');
    const foodRef = collection(db, 'artifacts', appId, 'users', user.uid, 'food_logs');
    const mealsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'custom_meals');
    const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'food_history');

    const unsubProfile = onSnapshot(userRef, (doc) => setUserProfile(doc.exists() ? doc.data() : null));
    const unsubWorkouts = onSnapshot(query(workoutsRef, orderBy('order')), (snap) => setWorkouts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubLogs = onSnapshot(query(logsRef, orderBy('timestamp', 'desc'), limit(100)), (snap) => setWorkoutLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubWeight = onSnapshot(query(weightRef, orderBy('date', 'desc'), limit(30)), (snap) => setWeightLog(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubFood = onSnapshot(query(foodRef, orderBy('timestamp', 'desc'), limit(200)), (snap) => setFoodLog(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubMeals = onSnapshot(mealsRef, (snap) => setCustomMeals(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubHistory = onSnapshot(query(historyRef, orderBy('lastUsed', 'desc'), limit(20)), (snap) => {
        setFoodHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
    });

    return () => {
      unsubProfile(); unsubWorkouts(); unsubLogs(); unsubWeight(); unsubFood(); unsubMeals(); unsubHistory();
    };
  }, [user, authLoading]);

  const actions = {
    saveProfile: async (data) => { if(user) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid), data, { merge: true }); },
    updateWorkoutPlan: async (dayId, data) => { if(user) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'workouts', dayId), { ...data, order: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(data.day) }); },
    saveWorkoutLog: async (log, dateStr) => { if(user) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'workout_logs'), { ...log, date: dateStr, timestamp: serverTimestamp() }); },
    deleteWorkoutLog: async (id) => { if(user) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'workout_logs', id)); },
    saveWeight: async (weight, dateStr) => { if(user) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'weight_logs'), { weight: parseFloat(weight), date: dateStr }); },
    
    saveFood: async (foodData, dateStr, mealType) => {
        if(!user) return;
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'food_logs'), { ...foodData, date: dateStr, mealType, timestamp: serverTimestamp() });
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'food_history'), { ...foodData, lastUsed: serverTimestamp() });
    },
    updateFood: async (id, foodData, dateStr, mealType) => {
        if(!user) return;
        // In-place edit of an existing log — avoids the delete+re-add churn AND the extra
        // food_history duplicate the old edit path piled up on every edit (B20).
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'food_logs', id), { ...foodData, date: dateStr, mealType });
    },
    deleteFood: async (id) => { if(user) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'food_logs', id)); },
    
    saveRecipe: async (mealData) => {
        if(!user) return null;
        if (mealData.id) { const { id, ...rest } = mealData; await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'custom_meals', id), rest); return id; }
        const ref = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'custom_meals'), mealData);
        return ref.id; // returned so the AI "add meal" flow can offer undo
    },
    deleteRecipe: async (id) => { if(user) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'custom_meals', id)); },
    
    deleteHistoryItem: async (id) => { 
        if (user) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'food_history', id)); 
    }
  };

  return { user, authLoading, loading, workouts, workoutLogs, weightLog, foodLog, customMeals, userProfile, foodHistory, actions };
};