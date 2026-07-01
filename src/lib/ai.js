// src/lib/ai.js
import { callWorker } from "./workerClient";

// Latest remaining daily quota the worker reported, by type. The UI can read this
// to show "N chats left" instead of only discovering the limit when it's hit.
export const aiQuota = { chat: null, search: null };

/**
 * Calls the worker '/ai' route.
 * Includes robust parsing to handle Markdown wrappers and conversational fluff.
 */
export const generateContent = async (prompt, type = 'chat') => {
  try {
    // The worker returns the payload DIRECTLY as { text, remaining } (no Firebase envelope);
    // tolerate the legacy raw-string shape too.
    const payload = await callWorker('/ai', { prompt, type });
    if (payload && typeof payload === 'object' && typeof payload.remaining === 'number') {
      aiQuota[type] = payload.remaining;
    }
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
    if (error.code === 'resource-exhausted' || (error.message && error.message.includes('resource-exhausted'))) {
      throw new Error(`Daily ${type} limit reached.`);
    }
    return null;
  }
};