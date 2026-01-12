import { db } from "../lib/firebase";
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs 
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../lib/firebase";

// --- PROFILE & SETTINGS ---

export const updateUserProfile = async (uid, data) => {
  const userRef = doc(db, "users", uid);
  await setDoc(userRef, data, { merge: true });
};

// Get User Profile Data
export const getUserProfile = async (uid) => {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  
  if (snap.exists()) {
    // Returning User: Return their data
    return snap.data();
  } else {
    // New User: Return NULL to trigger Onboarding Wizard
    return null; 
  }
};

// --- DIET TRACKER LOGS ---

export const addFoodLog = async (uid, foodItem) => {
  const logsRef = collection(db, "users", uid, "logs");
  await addDoc(logsRef, {
    ...foodItem,
    date: new Date().toISOString(),
    timestamp: Date.now()
  });
};

export const getTodayLogs = async (uid) => {
  const logsRef = collection(db, "users", uid, "logs");
  const startOfDay = new Date();
  startOfDay.setHours(0,0,0,0);
  const endOfDay = new Date();
  endOfDay.setHours(23,59,59,999);

  const q = query(
    logsRef, 
    where("date", ">=", startOfDay.toISOString()),
    where("date", "<=", endOfDay.toISOString()),
    orderBy("date", "desc")
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- TICKET SYSTEM ---
export const submitSupportTicket = async (ticketData) => {
  const functions = getFunctions(app, "us-central1");
  const submitTicket = httpsCallable(functions, 'submitTicket');
  
  try {
    const result = await submitTicket(ticketData);
    return result.data;
  } catch (error) {
    console.error("Ticket Submission Failed:", error);
    throw error;
  }
};