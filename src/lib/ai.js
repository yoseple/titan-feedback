import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase"; 

const functions = getFunctions(app, "us-central1");

export const generateContent = async (prompt, type = 'chat') => {
  const generateAI = httpsCallable(functions, 'generateAI');

  try {
    const result = await generateAI({ prompt, type });
    let text = result.data;

    if (!text || typeof text !== 'string') return null;

    // 1. Strip Markdown wrappers
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    // 2. Extract JSON Object
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1) {
      text = text.substring(firstBrace, lastBrace + 1);
    }

    // 3. FIX: Sanitize bad control characters (The cause of your SyntaxError)
    // This replaces unescaped newlines within strings to prevent JSON breakage
    text = text.replace(/[\n\r\t]/g, (match) => {
        switch (match) {
            case '\n': return '\\n';
            case '\r': return '\\r';
            case '\t': return '\\t';
            default: return match;
        }
    });

    return JSON.parse(text);

  } catch (error) {
    console.error("AI Parse Error:", error);
    // Fallback: Return a simple error object if JSON fails completely
    return null;
  }
};