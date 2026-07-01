import { db } from "../lib/firebase";
import { callWorker } from "../lib/workerClient";
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

// FIX: Align with useTitanData and your DB Rules
const APP_ID = "titan-73b02";

// --- PROFILE & SETTINGS ---

export const updateUserProfile = async (uid, data) => {
  const userRef = doc(db, 'artifacts', APP_ID, 'users', uid);
  await setDoc(userRef, data, { merge: true });
};

export const getUserProfile = async (uid) => {
  const userRef = doc(db, 'artifacts', APP_ID, 'users', uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return snap.data();
  return null; 
};

// --- DIET TRACKER LOGS ---

export const addFoodLog = async (uid, foodItem) => {
  const logsRef = collection(db, 'artifacts', APP_ID, 'users', uid, 'food_logs');
  await addDoc(logsRef, {
    ...foodItem,
    date: new Date().toISOString(),
    timestamp: Date.now()
  });
};

export const getTodayLogs = async (uid) => {
  const logsRef = collection(db, 'artifacts', APP_ID, 'users', uid, 'food_logs');
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
  const { subject, message, type } = ticketData;

  try {
    // The worker returns { success, url, ticketId } DIRECTLY (no Firebase envelope).
    return await callWorker('/ticket', { subject, message, type });
  } catch (error) {
    console.error("Ticket Submission Failed:", error);
    throw error;
  }
};