import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

// Firebase web config is expected-public (protected by Firestore rules + App Check).
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

// Firestore with a durable offline cache: a gym PWA loses connectivity constantly,
// so serve reads from cache and queue writes (a logged set/food) until reconnect
// instead of failing/losing them.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Analytics is privacy-sensitive on a health app — only initialize where actually
// supported (never during unsupported/SSR contexts). Gate behind real consent later.
export let analytics = null;
isSupported().then((ok) => { if (ok) analytics = getAnalytics(app); }).catch(() => {});

export const appId = 'titan-73b02';