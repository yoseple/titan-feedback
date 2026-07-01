// Gemini call, ported from functions/index.js. Same model, endpoint, and generationConfig.
// Returns the completion text, or throws (non-OK response or empty candidate) so the
// caller can turn it into a 502 without charging quota. fetchImpl injectable for tests.

export async function callGemini(prompt, apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Force valid JSON so the client never has to string-surgery the response; cap tokens for cost.
        generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 2048 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status} ${res.statusText}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI returned an empty response.");
  return text;
}
