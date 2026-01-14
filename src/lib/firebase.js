import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics"; 

// FIX: Hardcoded keys to guarantee connection on Localhost & Mobile
const firebaseConfig = {
  apiKey: "AIzaSyAbXeadJcYu4KRfoAJGxm8rhVnG4oMrd1I",
  authDomain: "titan-73b02.firebaseapp.com",
  projectId: "titan-73b02",
  storageBucket: "titan-73b02.firebasestorage.app",
  messagingSenderId: "191700664948",
  appId: "1:191700664948:web:15f88fa61f8478f5ad4721",
  measurementId: "G-4M3T6YZEZG"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
export const appId = 'titan-73b02';