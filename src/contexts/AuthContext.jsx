// src/contexts/AuthContext.jsx
import React, { useContext, useState, useEffect } from "react";
import { auth } from "../lib/firebase"; 
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult
} from "firebase/auth";
import { track } from "../lib/analytics";

const AuthContext = React.createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Existing Email/Password functions (Keep these if you ever want them)
  function signup(email, password) {
    return createUserWithEmailAndPassword(auth, email, password);
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  // Google sign-in. Popups are unreliable in installed/standalone PWAs (especially
  // iOS), so use the full-page redirect flow there, and fall back to redirect if a
  // popup is blocked; keep the popup on desktop where it's the nicer UX.
  function googleLogin() {
    const provider = new GoogleAuthProvider();
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone === true;
    if (standalone) return signInWithRedirect(auth, provider);
    return signInWithPopup(auth, provider).catch((err) => {
      const code = err?.code;
      if (
        code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment" ||
        code === "auth/cancelled-popup-request"
      ) {
        return signInWithRedirect(auth, provider);
      }
      throw err;
    });
  }

  function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    // Complete a pending redirect sign-in (no-op for the popup flow); surface errors
    // and record the login once the redirect returns.
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) track("login", { method: "google" });
      })
      .catch((err) => console.error("Redirect sign-in failed:", err));

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    loading,
    signup,
    login,
    googleLogin, // <--- EXPORT THIS
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}