import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase"; // This works now because we added 'export' in Step 1

// Initialize Cloud Functions (Region must match your deploy, usually 'us-central1')
const functions = getFunctions(app, "us-central1");

/**
 * Calls the 'generateAI' Cloud Function securely.
 * @param {string} prompt - The text prompt to send to Gemini.
 * @returns {Promise<Object|null>} - The parsed JSON response from AI.
 */
export const generateContent = async (prompt) => {
  // Reference the 'generateAI' function we deployed to the cloud
  const generateAI = httpsCallable(functions, 'generateAI');

  try {
    // 1. Call the Cloud Function
    // The Cloud Function expects { prompt: "..." } in the body
    const result = await generateAI({ prompt });
    
    // 2. Extract Data
    // The Cloud Function returns the raw text string in result.data
    let text = result.data;

    if (!text) {
      console.warn("AI returned empty response.");
      return null;
    }

    // 3. Clean Markdown Formatting
    // Gemini often wraps JSON in ```json ... ``` code blocks. We must remove them.
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    // 4. Parse & Return JSON
    return JSON.parse(text);

  } catch (error) {
    console.error("Cloud AI Failed:", error);

    // Check for the specific Rate Limit error we threw in the backend
    if (error.message && error.message.includes('resource-exhausted')) {
      // You can let the UI handle this, or throw a specific error text
      throw new Error("Daily limit reached (30/30). Please try again tomorrow.");
    }

    return null;
  }
};