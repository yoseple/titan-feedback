// src/lib/ai.js
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase"; 

// Initialize Cloud Functions
const functions = getFunctions(app, "us-central1");

/**
 * Calls the 'generateAI' Cloud Function.
 * Includes robust parsing to handle Markdown wrappers and conversational fluff.
 */
export const generateContent = async (prompt, type = 'chat') => {
  const generateAI = httpsCallable(functions, 'generateAI');

  try {
    const result = await generateAI({ prompt, type });

    // The function now returns { text, remaining }; tolerate the legacy raw-string shape too.
    const payload = result.data;
    let text = (payload && typeof payload === 'object') ? payload.text : payload;
    if (!text || typeof text !== 'string') return null;

    // Server forces application/json, but strip stray code fences defensively.
    text = text.replace(/```json/gi, "").replace(/```/g, "").trim();

    try {
      return JSON.parse(text);
    } catch {
      // Last-resort: extract the outermost JSON object.
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        try { return JSON.parse(text.substring(first, last + 1)); } catch { /* fall through */ }
      }
      console.warn("AI response was not valid JSON");
      return null;
    }
  } catch (error) {
    console.error("Cloud AI Failed:", error);
    if (error.message && error.message.includes('resource-exhausted')) {
      throw new Error(`Daily ${type} limit reached.`);
    }
    return null;
  }
};