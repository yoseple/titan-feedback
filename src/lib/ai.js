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
    let text = result.data;

    // 1. Safety Check
    if (!text || typeof text !== 'string') return null;

    // 2. The "Markdown Stripper" Fix
    // Sometimes AI returns ```json ... ```. We must remove that wrapper.
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    // 3. Surgical Extraction: Find the JSON object inside the text
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1) {
      // Grab everything between the first { and the last }
      const jsonString = text.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        console.warn("JSON cleanup failed, trying raw text...");
      }
    }

    // 4. Fallback: Try parsing the cleaned text directly
    return JSON.parse(text);

  } catch (error) {
    console.error("Cloud AI Failed:", error);

    if (error.message && error.message.includes('resource-exhausted')) {
      throw new Error(`Daily ${type} limit reached.`);
    }

    return null;
  }
};